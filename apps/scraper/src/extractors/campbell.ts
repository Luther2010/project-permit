/**
 * Campbell Extractor implementation
 * Uses Puppeteer to interact with MGO Connect portal
 * Requires login, then navigation to portal, then clicking "Search Permits"
 */

import { BaseDailyExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";

export class CampbellExtractor extends BaseDailyExtractor {
    protected browser: Browser | null = null;
    protected page: Page | null = null;
    private readonly loginEmail = "luther2020@gmail.com";
    private readonly loginPassword = "12341234";
    private readonly portalUrl = "https://www.mgoconnect.org/cp/portal";

    /**
     * Normalize Campbell status text to our PermitStatus enum
     */
    private normalizeStatus(raw?: string): string {
        if (!raw) return "UNKNOWN";
        const s = raw.trim().toLowerCase();

        // ISSUED states
        if (
            s.includes("issued") ||
            s.includes("approved") ||
            s.includes("final") ||
            s.includes("completed")
        ) {
            return "ISSUED";
        }

        // IN_REVIEW states
        if (
            s.includes("pending") ||
            s.includes("review") ||
            s.includes("under review") ||
            s.includes("ready for issu") // "Approved (Ready for Issu" case
        ) {
            return "IN_REVIEW";
        }

        // INACTIVE states
        if (
            s.includes("void") ||
            s.includes("cancelled") ||
            s.includes("canceled") ||
            s.includes("expired") ||
            s.includes("closed")
        ) {
            return "INACTIVE";
        }

        return "UNKNOWN";
    }

    /**
     * Parse date string (MM/DD/YYYY format) to Date object
     */
    private parseDate(dateStr: string): Date | undefined {
        if (!dateStr || !dateStr.trim()) return undefined;

        // Handle formats like "10/28/2025 01:20 PM" or "10/28/2025"
        const datePart = dateStr.trim().split(" ")[0];
        const parts = datePart.split("/");
        if (parts.length !== 3) return undefined;

        const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        if (isNaN(month) || isNaN(day) || isNaN(year)) return undefined;

        return new Date(year, month, day);
    }

    /**
     * Extract address and parse zip code
     */
    private parseAddress(addressStr: string): { address: string; city?: string; zipCode?: string } {
        if (!addressStr) return { address: addressStr || "" };

        const trimmed = addressStr.trim();
        
        // Pattern: "ADDRESS, CITY STATE ZIP" or "ADDRESS, CITY STATE ZIP-XXXX"
        // Example: "99 ALICE AVE, CAMPBELL CA 95008"
        const zipMatch = trimmed.match(/\b(\d{5})(?:-\d{4})?\b(?:\s*$)/);
        const zipCode = zipMatch ? zipMatch[1] : undefined;

        // Extract city (usually before state)
        const cityMatch = trimmed.match(/,\s*([^,]+?)\s+(?:CA|California)/i);
        const city = cityMatch ? cityMatch[1].trim() : undefined;

        return {
            address: trimmed,
            city,
            zipCode,
        };
    }

    /**
     * Wait for Angular to finish loading
     */
    private async waitForAngular(page: Page): Promise<void> {
        try {
            // Wait for Angular to be ready
            await page.waitForFunction(
                () => {
                    const win = globalThis as any;
                    return (
                        win.getAllAngularRootElements !== undefined ||
                        win.ng !== undefined ||
                        (win.document && win.document.readyState === "complete")
                    );
                },
                { timeout: 10000 }
            );
            // Give Angular time to render
            await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (e) {
            // If Angular detection fails, just wait a bit
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    /**
     * Format date for date picker (MM/DD/YYYY)
     */
    private formatDate(date: Date): string {
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }

    /**
     * Perform login
     */
    private async login(page: Page): Promise<void> {
        // Wait for login form to be visible
        await page.waitForSelector('input[formcontrolname="Email"]', {
            timeout: 10000,
        });

        // Fill in email
        await page.type('input[formcontrolname="Email"]', this.loginEmail, { delay: 50 });
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Fill in password
        await page.type('input[formcontrolname="Password"]', this.loginPassword, { delay: 50 });
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Click login button
        const loginButton = await page.$('p-button[label="Login"] button');
        if (!loginButton) {
            throw new Error("Login button not found");
        }
        await loginButton.click();
        
        // Wait for navigation after login
        await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 });
        await this.waitForAngular(page);
    }

    /**
     * Select State dropdown
     */
    private async selectState(page: Page, stateName: string): Promise<void> {
        // Wait for state dropdown to be available
        await page.waitForSelector('p-dropdown', { timeout: 10000 });
        await this.waitForAngular(page);

        // Find and click the state dropdown (first dropdown should be State)
        const stateSelected = await page.evaluate((state: string) => {
            // @ts-expect-error - page.evaluate runs in browser context
            const dropdowns = Array.from(document.querySelectorAll('p-dropdown')) as Element[];
            // Usually the first dropdown is State
            if (dropdowns.length === 0) return false;
            
            const stateDropdown = dropdowns[0];
            const trigger = stateDropdown.querySelector('.p-dropdown-trigger, .p-dropdown-label-container');
            if (trigger) {
                // @ts-expect-error - page.evaluate runs in browser context
                (trigger as HTMLElement).click();
                return true;
            }
            return false;
        }, stateName);

        if (!stateSelected) {
            throw new Error("Could not find or click State dropdown");
        }

        // Wait for dropdown to open
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.waitForAngular(page);

        // Select "California" from the dropdown
        const californiaSelected = await page.evaluate((state: string) => {
            // @ts-expect-error - page.evaluate runs in browser context
            const overlay = document.querySelector('p-overlay .p-dropdown-panel') as Element | null;
            if (!overlay) return false;

            // @ts-expect-error - page.evaluate runs in browser context
            const items = overlay.querySelectorAll('li[role="option"], .p-dropdown-item') as NodeListOf<Element>;
            for (const item of items) {
                const text = item.textContent?.trim();
                if (text === state || text?.includes(state)) {
                    // @ts-expect-error - page.evaluate runs in browser context
                    (item as HTMLElement).click();
                    return true;
                }
            }
            return false;
        }, stateName);

            if (!californiaSelected) {
                throw new Error(`Could not find and select State: ${stateName}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.waitForAngular(page);
        }

    /**
     * Select Jurisdiction dropdown
     */
    private async selectJurisdiction(page: Page, jurisdictionName: string): Promise<void> {
        // Find and click the jurisdiction dropdown (second dropdown should be Jurisdiction)
        const jurisdictionSelected = await page.evaluate((jurisdiction: string) => {
            // @ts-expect-error - page.evaluate runs in browser context
            const dropdowns = Array.from(document.querySelectorAll('p-dropdown')) as Element[];
            // Usually the second dropdown is Jurisdiction
            if (dropdowns.length < 2) return false;
            
            const jurisdictionDropdown = dropdowns[1];
            const trigger = jurisdictionDropdown.querySelector('.p-dropdown-trigger, .p-dropdown-label-container');
            if (trigger) {
                // @ts-expect-error - page.evaluate runs in browser context
                (trigger as HTMLElement).click();
                return true;
            }
            return false;
        }, jurisdictionName);

        if (!jurisdictionSelected) {
            throw new Error("Could not find or click Jurisdiction dropdown");
        }

        // Wait for dropdown to open
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.waitForAngular(page);

        // Select "Campbell" from the dropdown
        const campbellSelected = await page.evaluate((jurisdiction: string) => {
            // @ts-expect-error - page.evaluate runs in browser context
            const overlay = document.querySelector('p-overlay .p-dropdown-panel') as Element | null;
            if (!overlay) return false;

            // @ts-expect-error - page.evaluate runs in browser context
            const items = overlay.querySelectorAll('li[role="option"], .p-dropdown-item') as NodeListOf<Element>;
            for (const item of items) {
                const text = item.textContent?.trim();
                if (text === jurisdiction || text?.includes(jurisdiction)) {
                    // @ts-expect-error - page.evaluate runs in browser context
                    (item as HTMLElement).click();
                    return true;
                }
            }
            return false;
        }, jurisdictionName);

            if (!campbellSelected) {
                throw new Error(`Could not find and select Jurisdiction: ${jurisdictionName}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.waitForAngular(page);
        }


    /**
     * Fill in search form and submit
     */
    private async fillSearchForm(page: Page, startDate: Date, endDate?: Date): Promise<void> {
        const startDateStr = this.formatDate(startDate);
        const endDateStr = endDate ? this.formatDate(endDate) : null;

        // Wait for the form to be visible - the multiselect should be inside .grid-item-right-content > ngx-search-project-result
        await page.waitForSelector('.grid-item-right-content ngx-search-project-result p-multiselect[placeholder="Status"]', {
            timeout: 15000,
            visible: true
        });

        // Step 1: Find the Status filter by its label
        const statusMultiselect = await page.evaluate(() => {
            // @ts-expect-error - page.evaluate runs in browser context
            const labels = Array.from(document.querySelectorAll('.p-multiselect-label')) as HTMLElement[];
            for (const label of labels) {
                if (label.textContent?.trim() === 'Status' || label.textContent?.includes('Status')) {
                    // Find the parent p-multiselect element
                    const multiselect = label.closest('p-multiselect');
                    return multiselect ? true : false;
                }
            }
            return false;
        });

        if (!statusMultiselect) {
            // Fallback to the previous selector
            const fallbackMultiselect = await page.$('p-multiselect[placeholder="Status"], .grid-item-right-content ngx-search-project-result p-multiselect');
            if (!fallbackMultiselect) {
                throw new Error("Status multiselect not found");
            }
        }

        // Find and click the .p-multiselect-trigger to expand the dropdown
        const triggerFound = await page.evaluate(() => {
            // @ts-expect-error - page.evaluate runs in browser context
            const labels = Array.from(document.querySelectorAll('.p-multiselect-label')) as HTMLElement[];
            for (const label of labels) {
                if (label.textContent?.trim() === 'Status' || label.textContent?.includes('Status')) {
                    // Find the parent p-multiselect element
                    const multiselect = label.closest('p-multiselect');
                    if (multiselect) {
                        // @ts-expect-error - page.evaluate runs in browser context
                        const trigger = multiselect.querySelector('.p-multiselect-trigger') as HTMLElement;
                        if (trigger) {
                            trigger.click();
                            return true;
                        }
                    }
                }
            }
            return false;
        });

        if (!triggerFound) {
            // Fallback: try to find and click any trigger near Status
            const trigger = await page.$('p-multiselect .p-multiselect-trigger');
            if (!trigger) {
                throw new Error("Could not find status multiselect trigger");
            }
            await trigger.click();
        }
        
        // Wait for dropdown to open
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await this.waitForAngular(page);

        // Select all status checkboxes
        // Wait for the panel to appear - try multiple selectors
        const panelSelectors = [
            'p-overlay .p-multiselect-panel',
            '.p-multiselect-panel',
            'p-overlay',
            '[role="listbox"]',
        ];
        
        for (const selector of panelSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 2000 });
                break;
            } catch (e) {
                // Try next selector
            }
        }
        
        // Wait for checkboxes to appear and click the first one (select all)
        let attempts = 0;
        let checkboxClicked = false;
        while (attempts < 10 && !checkboxClicked) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            
            const result = await page.evaluate(() => {
                // Find the multiselect header which contains the "select all" checkbox
                // @ts-expect-error - page.evaluate runs in browser context
                const header = document.querySelector('.p-multiselect-header') as HTMLElement | null;
                if (!header) {
                    return { found: false, message: "Multiselect header not found" };
                }
                
                // Find the select all checkbox - it's inside .p-checkbox within .p-multiselect-header
                // @ts-expect-error - page.evaluate runs in browser context
                const checkboxBox = header.querySelector('div[role="checkbox"].p-checkbox-box') as HTMLElement | null;
                // @ts-expect-error - page.evaluate runs in browser context
                const hiddenInput = header.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                
                if (!checkboxBox && !hiddenInput) {
                    return { found: false, message: "Select all checkbox not found in header" };
                }
                
                // Check if it's already checked - check both the input and aria-checked attribute
                const inputChecked = hiddenInput?.checked === true;
                const ariaChecked = checkboxBox?.getAttribute('aria-checked') === 'true';
                const hasHighlightClass = checkboxBox?.classList.contains('p-highlight');
                const isChecked = inputChecked && ariaChecked;
                
                if (!isChecked) {
                    // Try multiple click strategies
                    let clicked = false;
                    
                    // Strategy 1: Click the checkbox box div (the visible checkbox)
                    if (checkboxBox) {
                        checkboxBox.click();
                        clicked = true;
                    }
                    
                    // Strategy 2: Click the hidden input
                    if (hiddenInput) {
                        hiddenInput.click();
                        clicked = true;
                    }
                    
                    // Strategy 3: Click the parent .p-checkbox container
                    // @ts-expect-error - page.evaluate runs in browser context
                    const checkboxContainer = header.querySelector('.p-checkbox') as HTMLElement;
                    if (checkboxContainer) {
                        checkboxContainer.click();
                        clicked = true;
                    }
                    
                    // Check again after clicking
                    const inputCheckedAfter = hiddenInput?.checked === true;
                    const ariaCheckedAfter = checkboxBox?.getAttribute('aria-checked') === 'true';
                    const checkedAfter = inputCheckedAfter && ariaCheckedAfter;
                    
                    return {
                        found: true,
                        clicked: clicked,
                        checkedAfter: checkedAfter,
                        count: 1,
                        message: checkedAfter 
                            ? "Successfully clicked and checked select all checkbox" 
                            : "Clicked select all checkbox but verification shows unchecked (may need time to update)"
                    };
                } else {
                    return {
                        found: true,
                        clicked: false,
                        checkedAfter: true,
                        count: 1,
                        message: "Select all checkbox already checked"
                    };
                }
            });
            
            if (result.found) {
                // If we clicked but it's not verified as checked, wait and check again
                if (result.clicked && !result.checkedAfter) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    await this.waitForAngular(page);
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
                
                // Verify that the checkbox is now actually checked
                const verified = await page.evaluate(() => {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const header = document.querySelector('.p-multiselect-header') as HTMLElement | null;
                    if (!header) return { headerCheckboxChecked: false, reason: "Header not found" };
                    
                    // @ts-expect-error - page.evaluate runs in browser context
                    const hiddenInput = header.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                    // @ts-expect-error - page.evaluate runs in browser context
                    const checkboxBox = header.querySelector('div[role="checkbox"].p-checkbox-box') as HTMLElement | null;
                    
                    const inputChecked = hiddenInput?.checked === true;
                    const ariaChecked = checkboxBox?.getAttribute('aria-checked') === 'true';
                    const hasHighlight = checkboxBox?.classList.contains('p-highlight');
                    const isChecked = inputChecked && ariaChecked;
                    
                    // Also check how many status items are selected in the list
                    // @ts-expect-error - page.evaluate runs in browser context
                    const panel = document.querySelector('.p-multiselect-panel') as Element | null;
                    const listItems = panel ? Array.from(panel.querySelectorAll('li[role="option"]')) : [];
                    const checkedItems = listItems.filter(item => {
                        // @ts-expect-error - page.evaluate runs in browser context
                        const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement;
                        return checkbox?.checked === true;
                    });
                    
                    return {
                        headerCheckboxChecked: isChecked,
                        inputChecked: inputChecked,
                        ariaChecked: ariaChecked,
                        hasHighlight: hasHighlight,
                        statusItemsChecked: checkedItems.length,
                        totalStatusItems: listItems.length
                    };
                });
                
                // If still not checked, retry clicking
                if (!verified.headerCheckboxChecked && result.clicked) {
                    // Retry clicking one more time
                    await page.evaluate(() => {
                        // @ts-expect-error - page.evaluate runs in browser context
                        const header = document.querySelector('.p-multiselect-header') as HTMLElement | null;
                        if (!header) return false;
                        
                        // @ts-expect-error - page.evaluate runs in browser context
                        const checkboxBox = header.querySelector('div[role="checkbox"].p-checkbox-box') as HTMLElement | null;
                        // @ts-expect-error - page.evaluate runs in browser context
                        const hiddenInput = header.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                        
                        if (checkboxBox) {
                            checkboxBox.click();
                            return true;
                        } else if (hiddenInput) {
                            hiddenInput.click();
                            return true;
                        }
                        return false;
                    });
                    
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    await this.waitForAngular(page);
                }
                
                // Final verification
                const finalCheck = await page.evaluate(() => {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const header = document.querySelector('.p-multiselect-header') as HTMLElement | null;
                    if (!header) return { checked: false, statusItems: 0 };
                    
                    // @ts-expect-error - page.evaluate runs in browser context
                    const hiddenInput = header.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                    // @ts-expect-error - page.evaluate runs in browser context
                    const checkboxBox = header.querySelector('div[role="checkbox"].p-checkbox-box') as HTMLElement | null;
                    
                    const inputChecked = hiddenInput?.checked === true;
                    const ariaChecked = checkboxBox?.getAttribute('aria-checked') === 'true';
                    const isChecked = inputChecked && ariaChecked;
                    
                    // Count selected status items
                    // @ts-expect-error - page.evaluate runs in browser context
                    const panel = document.querySelector('.p-multiselect-panel') as Element | null;
                    const listItems = panel ? Array.from(panel.querySelectorAll('li[role="option"]')) : [];
                    const checkedItems = listItems.filter(item => {
                        // @ts-expect-error - page.evaluate runs in browser context
                        const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement;
                        return checkbox?.checked === true;
                    });
                    
                    return { checked: isChecked, statusItems: checkedItems.length };
                });
                
                if (finalCheck.checked) {
                    checkboxClicked = true;
                    break;
                } else {
                    // Continue anyway - maybe Angular needs more time
                    checkboxClicked = true;
                    break;
                }
            }
            
            attempts++;
        }
        
        if (!checkboxClicked) {
            throw new Error("Could not find or click the first checkbox (select all)");
        }
        
        // Click outside to close dropdown
        await page.click('body');
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this.waitForAngular(page);

        // Step 2: Set "Created After" date
        const createdAfterInput = await page.$('.grid-item-right-content ngx-search-project-result input[placeholder="Created After"]');
        if (!createdAfterInput) {
            throw new Error("Could not find 'Created After' input");
        }
        await createdAfterInput.click({ clickCount: 3 }); // Select all
        await createdAfterInput.type(startDateStr);
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Step 3: Set "Created Before" date (only if endDate is provided)
        if (endDateStr) {
            const createdBeforeInput = await page.$('.grid-item-right-content ngx-search-project-result input[placeholder="Created Before"]');
            if (!createdBeforeInput) {
                throw new Error("Could not find 'Created Before' input");
            }
            await createdBeforeInput.click({ clickCount: 3 }); // Select all
            await createdBeforeInput.type(endDateStr);
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // Step 4: Find and check "Description" checkbox in the multiselect that shows "X items selected"
        // This multiselect is inside app-form-multi-select component
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        const descriptionChecked = await page.evaluate(() => {
            // Find the app-form-multi-select component first
            // @ts-expect-error - page.evaluate runs in browser context
            const formMultiSelect = document.querySelector('app-form-multi-select') as Element | null;
            if (!formMultiSelect) {
                return { success: false, message: "app-form-multi-select not found" };
            }
            
            // Find the p-multiselect inside it
            // @ts-expect-error - page.evaluate runs in browser context
            const targetMultiselect = formMultiSelect.querySelector('p-multiselect') as Element | null;
            if (!targetMultiselect) {
                return { success: false, message: "p-multiselect not found" };
            }
            
            // Find and click the trigger to expand
            // @ts-expect-error - page.evaluate runs in browser context
            const trigger = targetMultiselect.querySelector('.p-multiselect-trigger') as HTMLElement | null;
            if (!trigger) {
                return { success: false, message: "Trigger not found" };
            }
            
            trigger.click();
            return { success: true, message: "Trigger clicked" };
        });
        
        // Wait for dropdown to open
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await this.waitForAngular(page);
        
        // Find and check the "Description" checkbox
        // Wait for the panel to appear - it should be associated with app-form-multi-select
        await page.waitForSelector('.p-multiselect-panel, p-overlay .p-multiselect-panel', { timeout: 5000 });
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        const descriptionResult = await page.evaluate(() => {
            // Try multiple selectors to find the panel
            // @ts-expect-error - page.evaluate runs in browser context
            let panel = document.querySelector('.p-multiselect-panel') as Element | null;
            if (!panel) {
                // @ts-expect-error - page.evaluate runs in browser context
                panel = document.querySelector('p-overlay .p-multiselect-panel') as Element | null;
            }
            if (!panel) {
                return { success: false, message: "Panel not found" };
            }
            
            // @ts-expect-error - page.evaluate runs in browser context
            const listItems = Array.from(panel.querySelectorAll('li.p-multiselect-item')) as HTMLElement[];
            const itemTexts = listItems.map(item => item.textContent?.trim()).filter(t => t);
            
            // Find the "Description" checkbox - it's the 8th item (index 7, 0-based)
            if (listItems.length >= 8) {
                const descriptionItem = listItems[7]; // 8th item (0-indexed)
                descriptionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                const text = descriptionItem.textContent?.trim() || '';
                
                // @ts-expect-error - page.evaluate runs in browser context
                const checkboxBox = descriptionItem.querySelector('.p-checkbox-box') as HTMLElement | null;
                // @ts-expect-error - page.evaluate runs in browser context
                const checkbox = descriptionItem.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                
                if (!checkboxBox && !checkbox) {
                    return { success: false, message: "Description checkbox elements not found in 8th item" };
                }
                
                // Check multiple indicators that the item is selected
                const ariaChecked = checkboxBox?.getAttribute('aria-checked') === 'true';
                const inputChecked = checkbox?.checked === true;
                const hasHighlight = descriptionItem.classList.contains('p-highlight');
                const ariaSelected = descriptionItem.getAttribute('aria-selected') === 'true';
                const checkboxBoxHighlight = checkboxBox?.classList.contains('p-highlight');
                
                const isChecked = ariaChecked || inputChecked || hasHighlight || ariaSelected || checkboxBoxHighlight;
                
                if (!isChecked) {
                    // Scroll into view again to be sure
                    descriptionItem.scrollIntoView({ behavior: 'instant', block: 'center' });
                    
                    // Try multiple click strategies
                    descriptionItem.click();
                    if (checkboxBox) checkboxBox.click();
                    if (checkbox) checkbox.click();
                    
                    // @ts-expect-error - page.evaluate runs in browser context
                    const checkboxContainer = descriptionItem.querySelector('.p-checkbox') as HTMLElement;
                    if (checkboxContainer) {
                        checkboxContainer.click();
                    }
                    
                    // Check immediately after clicking
                    const checkedImmediately = checkbox?.checked === true || checkboxBox?.getAttribute('aria-checked') === 'true';
                    
                    return {
                        success: true,
                        message: "Description checkbox clicked",
                        itemText: text,
                        needsVerification: !checkedImmediately
                    };
                } else {
                    return { success: true, message: "Description checkbox already checked", itemText: text };
                }
            } else {
                // Fallback: try to find by text match if we don't have 8 items
                for (const item of listItems) {
                    const text = item.textContent?.trim() || '';
                    if (text === 'Description' || text.toLowerCase().includes('description')) {
                        item.scrollIntoView({ behavior: 'instant', block: 'center' });
                        
                        // @ts-expect-error - page.evaluate runs in browser context
                        const checkboxBox = item.querySelector('.p-checkbox-box') as HTMLElement | null;
                        // @ts-expect-error - page.evaluate runs in browser context
                        const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                        
                        const isChecked = checkbox?.checked === true || checkboxBox?.getAttribute('aria-checked') === 'true';
                        
                        if (!isChecked) {
                            if (checkboxBox) checkboxBox.click();
                            if (checkbox && !checkbox.checked) checkbox.click();
                            item.click();
                            
                            return {
                                success: true,
                                message: "Description checkbox found by text and clicked",
                                itemText: text,
                                needsVerification: true
                            };
                        } else {
                            return { success: true, message: "Description checkbox already checked", itemText: text };
                        }
                    }
                }
            }
            
            return { success: false, message: `Description checkbox not found in list` };
        });
        
        // Wait a moment after scrolling (if we scrolled)
        if (descriptionResult.success) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for scroll to complete
        }
        
        // If we clicked it, wait and verify it's actually checked
        if (descriptionResult.success && 'needsVerification' in descriptionResult && descriptionResult.needsVerification) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            await this.waitForAngular(page);
            
            const verified = await page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context
                const panel = document.querySelector('.p-multiselect-panel, p-overlay .p-multiselect-panel') as Element | null;
                if (!panel) return false;
                
                // @ts-expect-error - page.evaluate runs in browser context
                const listItems = Array.from(panel.querySelectorAll('li.p-multiselect-item')) as HTMLElement[];
                
                // Check the 8th item (index 7) first
                if (listItems.length >= 8) {
                    const descriptionItem = listItems[7];
                    descriptionItem.scrollIntoView({ behavior: 'instant', block: 'center' });
                    
                    // Check multiple indicators that the item is selected
                    // @ts-expect-error - page.evaluate runs in browser context
                    const checkboxBox = descriptionItem.querySelector('.p-checkbox-box') as HTMLElement | null;
                    // @ts-expect-error - page.evaluate runs in browser context
                    const checkbox = descriptionItem.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                    
                    // Check multiple ways: aria-checked, checked property, p-highlight class, aria-selected
                    const ariaChecked = checkboxBox?.getAttribute('aria-checked') === 'true';
                    const inputChecked = checkbox?.checked === true;
                    const hasHighlight = descriptionItem.classList.contains('p-highlight');
                    const ariaSelected = descriptionItem.getAttribute('aria-selected') === 'true';
                    const checkboxBoxHighlight = checkboxBox?.classList.contains('p-highlight');
                    
                    const isChecked = ariaChecked || inputChecked || hasHighlight || ariaSelected || checkboxBoxHighlight;
                    return isChecked;
                }
                
                // Fallback: search by text
                for (const item of listItems) {
                    const text = item.textContent?.trim() || '';
                    if (text === 'Description' || text.toLowerCase().includes('description')) {
                        // @ts-expect-error - page.evaluate runs in browser context
                        const checkboxBox = item.querySelector('.p-checkbox-box') as HTMLElement | null;
                        // @ts-expect-error - page.evaluate runs in browser context
                        const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
                        
                        const isChecked = checkbox?.checked === true || checkboxBox?.getAttribute('aria-checked') === 'true';
                        return isChecked;
                    }
                }
                return false;
            });
            
            if (!verified) {
                // Retry clicking the 8th item
                await page.evaluate(() => {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const panel = document.querySelector('.p-multiselect-panel, p-overlay .p-multiselect-panel') as Element | null;
                    if (!panel) return false;
                    
                    // @ts-expect-error - page.evaluate runs in browser context
                    const listItems = Array.from(panel.querySelectorAll('li.p-multiselect-item')) as HTMLElement[];
                    
                    if (listItems.length >= 8) {
                        const descriptionItem = listItems[7];
                        descriptionItem.scrollIntoView({ behavior: 'instant', block: 'center' });
                        
                        // Click the list item multiple times to ensure it registers
                        descriptionItem.click();
                        descriptionItem.click(); // Double-click sometimes helps
                        
                        return true;
                    }
                    return false;
                });
                
                // Wait again and verify
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await this.waitForAngular(page);
                
                const retryVerified = await page.evaluate(() => {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const panel = document.querySelector('.p-multiselect-panel, p-overlay .p-multiselect-panel') as Element | null;
                    if (!panel) return false;
                    
                    // @ts-expect-error - page.evaluate runs in browser context
                    const listItems = Array.from(panel.querySelectorAll('li.p-multiselect-item')) as HTMLElement[];
                    
                    if (listItems.length >= 8) {
                        const descriptionItem = listItems[7];
                        // @ts-expect-error - page.evaluate runs in browser context
                        const checkboxBox = descriptionItem.querySelector('.p-checkbox-box') as HTMLElement | null;
                        
                        const ariaChecked = checkboxBox?.getAttribute('aria-checked') === 'true';
                        const hasHighlight = descriptionItem.classList.contains('p-highlight');
                        const checkboxBoxHighlight = checkboxBox?.classList.contains('p-highlight');
                        
                        return ariaChecked || hasHighlight || checkboxBoxHighlight;
                    }
                    return false;
                });
                
            }
        }
        
        // Close the dropdown by clicking outside
        await page.click('body');
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this.waitForAngular(page);

        // Step 5: Click Search button
        const searchButton = await page.$('.grid-item-right-content ngx-search-project-result p-button[label="Search"] button');
        if (!searchButton) {
            throw new Error("Search button not found");
        }
        await searchButton.click();
        
        // Wait for results to load - wait for table rows to appear
        await this.waitForAngular(page);
        
        // Wait for table rows to appear (up to 10 seconds)
        for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.waitForAngular(page);
            
            const rowCount = await page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context
                const tbody = document.querySelector('p-table .p-datatable-table tbody, p-table table tbody');
                if (!tbody) return 0;
                // @ts-expect-error - page.evaluate runs in browser context
                const rows = Array.from(tbody.querySelectorAll('tr')) as HTMLTableRowElement[];
                // Filter out header rows
                return rows.filter(row => !row.querySelector('th')).length;
            });
            
            if (rowCount > 0) {
                break;
            }
        }
    }

    async scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult> {
        try {
            // Launch browser
            this.browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });

            // Navigate directly to portal
            await this.page.goto(this.portalUrl, {
                waitUntil: "networkidle2",
                timeout: 60000,
            });

            await this.waitForAngular(this.page);
            await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for page to render

            // Step 1: Click "Login" button
            const loginButtonFound = await this.page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context
                const buttons = Array.from(document.querySelectorAll('button, a')) as Element[];
                for (const btn of buttons) {
                    const text = (btn.textContent || '').trim().toLowerCase();
                    if (text === 'login') {
                        // @ts-expect-error - page.evaluate runs in browser context
                        (btn as HTMLElement).click();
                        return true;
                    }
                }
                return false;
            });

            if (!loginButtonFound) {
                // Check if login form is already visible
                const hasLoginForm = await this.page.evaluate(() => {
                    // @ts-expect-error - page.evaluate runs in browser context
                    return !!document.querySelector('input[formcontrolname="Email"]');
                });
                
                if (!hasLoginForm) {
                    throw new Error("Could not find 'Login' button or login form");
                }
            } else {
                // Wait for login form to appear
                await this.page.waitForSelector('input[formcontrolname="Email"]', {
                    timeout: 10000,
                });
            }

            // Step 2: Login with credentials
            await this.login(this.page);

            // Step 3: Select State: California
            await this.selectState(this.page, "California");

            // Step 4: Select Jurisdiction: Campbell
            await this.selectJurisdiction(this.page, "Campbell");

            // Step 5: Click "Continue" button
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for jurisdiction to settle
            await this.waitForAngular(this.page);

            const continueButtonFound = await this.page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context
                const buttons = Array.from(document.querySelectorAll('button, a')) as Element[];
                for (const btn of buttons) {
                    const text = (btn.textContent || '').trim().toLowerCase();
                    if (text === 'continue') {
                        // @ts-expect-error - page.evaluate runs in browser context
                        (btn as HTMLElement).click();
                        return true;
                    }
                }
                return false;
            });

            if (!continueButtonFound) {
                throw new Error("Could not find and click 'Continue' button");
            }

            // Wait for page to update after Continue
            await this.page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {
                // No navigation occurred, continue anyway
            });
            await this.waitForAngular(this.page);
            await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for menu to appear

            // Step 6: Click "Search Permits" button
            await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for dropdowns to settle
            await this.waitForAngular(this.page);

            const searchPermitsFound = await this.page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context
                const links = Array.from(document.querySelectorAll('a.p-menuitem-link')) as Element[];
                for (const link of links) {
                    const span = link.querySelector('span[data-pc-section="label"]');
                    if (span && span.textContent?.trim() === 'Search Permits') {
                        // @ts-expect-error - page.evaluate runs in browser context
                        (link as HTMLElement).click();
                        return true;
                    }
                }
                
                // Fallback: search all links for text content
                // @ts-expect-error - page.evaluate runs in browser context
                const allLinks = Array.from(document.querySelectorAll('a')) as Element[];
                for (const link of allLinks) {
                    const text = link.textContent?.trim();
                    if (text === 'Search Permits' || text?.includes('Search Permits')) {
                        // @ts-expect-error - page.evaluate runs in browser context
                        (link as HTMLElement).click();
                        return true;
                    }
                }
                return false;
            });

            if (!searchPermitsFound) {
                throw new Error("Could not find and click 'Search Permits' button");
            }

            // Wait for navigation to search page
            await this.page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {
                // No navigation occurred, continue anyway
            });
            await this.waitForAngular(this.page);
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Wait a bit more to ensure we're on the search page
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.waitForAngular(this.page);

            // Calculate dates to search
            // If startDate is provided, use it; otherwise default to today
            // If endDate is provided, use it; otherwise don't set an upper bound
            const searchStartDate = startDate || new Date();
            const searchEndDate = endDate || undefined;

            // Fill search form and submit
            await this.fillSearchForm(this.page, searchStartDate, searchEndDate);

            // Extract permit data from all pages with pagination
            const permits = await this.navigatePagesAndExtract(limit);

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error: any) {
            console.error(`[CampbellExtractor] Error during scrape:`, error);
            return {
                permits: [],
                success: false,
                error: error.message || "Unknown error",
                scrapedAt: new Date(),
            };
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    /**
     * Navigate through pagination and extract permits from all pages
     */
    protected async navigatePagesAndExtract(limit?: number): Promise<PermitData[]> {
        if (!this.page) {
            throw new Error("Page not initialized");
        }

        const allPermits: PermitData[] = [];
        let currentPage = 1;
        let hasMorePages = true;

        while (hasMorePages) {
            console.log(`[CampbellExtractor] Scraping page ${currentPage}...`);

            // Wait for results table to be visible
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.waitForAngular(this.page);
            
            try {
                await this.page.waitForSelector('p-table .p-datatable-table tbody, p-table table tbody, .p-datatable-tbody', {
                    timeout: 5000,
                    visible: true
                });
            } catch (e) {
                console.log(`[CampbellExtractor] No results table found on page ${currentPage}`);
                break;
            }

            // Wait a bit more for table data to load
            await new Promise((resolve) => setTimeout(resolve, 3000));
            await this.waitForAngular(this.page);

            // Extract permits from current page
            const pagePermits = await this.parsePermitData(null, limit ? limit - allPermits.length : undefined);
            console.log(`[CampbellExtractor] Found ${pagePermits.length} permits on page ${currentPage}`);
            
            allPermits.push(...pagePermits);

            // Stop if we've reached the limit
            if (limit && allPermits.length >= limit) {
                allPermits.splice(limit);
                break;
            }

            // Check if there's a next page button
            hasMorePages = await this.page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context
                const nextButton = document.querySelector('button.p-paginator-next') as HTMLButtonElement | null;
                if (!nextButton) {
                    return false;
                }
                // Check if button is disabled
                return !nextButton.disabled && !nextButton.classList.contains('p-disabled');
            });

            if (hasMorePages) {
                // Click next page button
                const clicked = await this.page.evaluate(() => {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const nextButton = document.querySelector('button.p-paginator-next') as HTMLButtonElement | null;
                    if (nextButton && !nextButton.disabled && !nextButton.classList.contains('p-disabled')) {
                        nextButton.click();
                        return true;
                    }
                    return false;
                });

                if (!clicked) {
                    console.log(`[CampbellExtractor] Could not click next page button`);
                    break;
                }

                // Wait for page to load
                await this.page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {
                    // No navigation occurred, continue anyway
                });
                await this.waitForAngular(this.page);
                await new Promise((resolve) => setTimeout(resolve, 2000));
                
                currentPage++;
            }
        }

        console.log(`[CampbellExtractor] Total permits extracted: ${allPermits.length}`);
        return allPermits;
    }

    protected async parsePermitData(rawData: any, limit?: number): Promise<PermitData[]> {
        if (!this.page) {
            throw new Error("Page not initialized");
        }

        const permits: PermitData[] = [];

        // Wait for results table to be visible - use the specific selector from the HTML structure
        // First, wait a bit more for results to appear
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await this.waitForAngular(this.page);
        
        try {
            await this.page.waitForSelector('p-table .p-datatable-table tbody, p-table table tbody, .p-datatable-tbody', {
                timeout: 5000,
                visible: true
            });
        } catch (e) {
            // Table selector not found, but continuing anyway
        }

        // Wait a bit more for table data to load
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await this.waitForAngular(this.page);

        // Extract data from table
        // First, find the column index for Description by checking table headers
        const columnMapping = await this.page.evaluate(() => {
            // @ts-expect-error - page.evaluate runs in browser context
            const table = document.querySelector('p-table .p-datatable-table, p-table table') as HTMLTableElement | null;
            if (!table) {
                return null;
            }
            
            // @ts-expect-error - page.evaluate runs in browser context
            const headerRow = table.querySelector('thead tr') as HTMLTableRowElement | null;
            if (!headerRow) {
                return null;
            }
            
            // @ts-expect-error - page.evaluate runs in browser context
            const headers = Array.from(headerRow.querySelectorAll('th')) as HTMLTableCellElement[];
            const columnIndices: Record<string, number> = {};
            
            headers.forEach((header, index) => {
                const text = header.textContent?.trim() || '';
                // Map known columns (skip expand button at index 0 and checkbox at index 1)
                if (text.includes('Project Number') || text === 'Project Number') {
                    columnIndices['projectNumber'] = index;
                } else if (text.includes('Project Name') || text === 'Project Name') {
                    columnIndices['projectName'] = index;
                } else if (text.includes('Work Type') || text === 'Work Type') {
                    columnIndices['workType'] = index;
                } else if (text.includes('Status') || text === 'Status') {
                    columnIndices['status'] = index;
                } else if (text.includes('Address') || text === 'Address') {
                    columnIndices['address'] = index;
                } else if (text.includes('Unit') || text === 'Unit') {
                    columnIndices['unit'] = index;
                } else if (text.includes('Designation') || text === 'Designation') {
                    columnIndices['designation'] = index;
                } else if (text.includes('Created Date') || text.includes('Created')) {
                    columnIndices['createdDate'] = index;
                } else if (text.includes('Parcel Number') || text.includes('Parcel')) {
                    columnIndices['parcelNumber'] = index;
                } else if (text.includes('Description') || text === 'Description') {
                    columnIndices['description'] = index;
                }
            });
            
            return columnIndices;
        });
        
        // Extract data from table using the column mapping
        const tableData = await this.page.evaluate((mapping: Record<string, number>) => {
            // @ts-expect-error - page.evaluate runs in browser context
            const tbody = document.querySelector('p-table .p-datatable-table tbody, p-table table tbody, .p-datatable-tbody') as HTMLTableSectionElement | null;
            if (!tbody) {
                return [];
            }

            // @ts-expect-error - page.evaluate runs in browser context
            const rows = Array.from(tbody.querySelectorAll('tr')) as HTMLTableRowElement[];
            
            return rows.map((row) => {
                // Skip header rows if any (rows with th elements)
                if (row.querySelector('th')) {
                    return null;
                }

                // @ts-expect-error - page.evaluate runs in browser context
                const cells = Array.from(row.querySelectorAll('td')) as HTMLTableCellElement[];
                
                // Extract data using column mapping (fully inline, no functions to avoid serialization issues)
                const projNumIdx = mapping?.projectNumber ?? 2;
                const projNameIdx = mapping?.projectName ?? 3;
                const workTypeIdx = mapping?.workType ?? 4;
                const statusIdx = mapping?.status ?? 5;
                const addressIdx = mapping?.address ?? 6;
                const unitIdx = mapping?.unit ?? 7;
                const descIdx = mapping?.description ?? 8;
                const designIdx = mapping?.designation ?? 9;
                const createdIdx = mapping?.createdDate ?? 10;
                const parcelIdx = mapping?.parcelNumber ?? 11;
                
                const projectNumber = cells[projNumIdx]?.textContent?.trim() || "";
                const projectName = cells[projNameIdx]?.textContent?.trim() || "";
                const workType = cells[workTypeIdx]?.textContent?.trim() || "";
                const status = cells[statusIdx]?.textContent?.trim() || "";
                const address = cells[addressIdx]?.textContent?.trim() || "";
                const unit = cells[unitIdx]?.textContent?.trim() || "";
                const description = cells[descIdx]?.textContent?.trim() || "";
                const designation = cells[designIdx]?.textContent?.trim() || "";
                const createdDate = cells[createdIdx]?.textContent?.trim() || "";
                const parcelNumber = cells[parcelIdx]?.textContent?.trim() || "";

                // Try to find link to detail page (could be in any cell)
                // @ts-expect-error - page.evaluate runs in browser context
                const link = row.querySelector('a[href*="project"], a[href*="detail"], a[href*="permit"]') as HTMLAnchorElement | null;
                const sourceUrl = link ? link.href : undefined;

                return {
                    projectNumber,
                    projectName,
                    workType,
                    status,
                    address,
                    unit,
                    designation,
                    createdDate,
                    parcelNumber,
                    description,
                    sourceUrl,
                };
            }).filter((row): row is NonNullable<typeof row> => row !== null); // Filter out null entries
        }, columnMapping || {});

        for (let i = 0; i < tableData.length; i++) {
            if (limit && permits.length >= limit) break;

            const row = tableData[i];

            try {
                const permitNumber = row.projectNumber;
                if (!permitNumber) {
                    continue;
                }

                // Parse address
                const { address, city, zipCode } = this.parseAddress(row.address);

                // Parse dates
                const appliedDate = row.createdDate ? this.parseDate(row.createdDate) : undefined;
                const appliedDateString = row.createdDate?.split(" ")[0];

                // Extract status
                const status = this.normalizeStatus(row.status);

                // Use the actual description from the Description column, fallback to projectName if not available
                const description = row.description || row.projectName || row.workType || undefined;

                const permit: PermitData = {
                    permitNumber,
                    title: row.projectName || row.workType,
                    description,
                    address,
                    city: city || this.city, // Use parsed city or fallback to "Campbell"
                    state: this.state,
                    zipCode,
                    permitType: row.workType || row.designation,
                    status,
                    appliedDate,
                    appliedDateString,
                    sourceUrl: row.sourceUrl || this.url,
                };

                if (this.validatePermitData(permit)) {
                    permits.push(permit);
                }
            } catch (error: any) {
                // Silently skip rows with parsing errors
            }
        }

        return permits;
    }
}

