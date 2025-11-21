# Project Permit - TODO List

## 🚨 P0 - Critical Priorities

### 1. **Email Deliverability**
   - **Improve email deliverability**: Prevent emails from landing in spam folders
     - Verify domain in AWS SES (not just email address)
     - Set up SPF, DKIM, DMARC DNS records
     - Add unsubscribe link to emails (CAN-SPAM compliance)
     - Add physical address to email footer (CAN-SPAM requirement)
     - Use proper from name/address format
     - Monitor bounce/complaint rates in AWS SES

### 2. **Username/Email Signup**
   - **Add credentials-based authentication**: Implement username/email signup alongside Google sign-in
     - Add Credentials provider to NextAuth configuration
     - Create signup form component with username and email fields
     - Implement password hashing (bcrypt) for secure storage
     - Update auth-buttons component to show signup option
     - Add validation for username, email, and password
     - Handle duplicate email/username errors gracefully

### 3. **Investigate updatedDate vs scrapedDate (timezone)**
   - Investigate the difference between `updatedDate` and `scrapedDate` fields and their timezone handling
   - Determine which field should be used for "Last Update Date Range" filtering
   - Ensure consistent timezone handling across both fields
   - Verify that filtering logic correctly uses the appropriate field

### 4. **Investigate empty appliedDateString**
   - Investigate why many permits have an empty `appliedDateString` field
   - Determine if this is a scraper issue (data not available on source sites) or extraction issue
   - Check which cities/extractors are most affected
   - Determine if we should fall back to `appliedDate` (DateTime) when `appliedDateString` is empty
   - Verify data quality and completeness across all cities

### 5. **Sorting empty values**
   - When sorting by a field, entries with empty/null values for that field should be shown last
   - Apply this behavior consistently across all sortable fields (PERMIT_TYPE, PROPERTY_TYPE, CITY, VALUE, APPLIED_DATE, STATUS)
   - Update GraphQL resolver sorting logic to handle null/empty values appropriately
   - Ensure both ASC and DESC sorting respect this rule (empty values always last)

## 📋 P1 - Important Tasks

### Classification Improvements
   - **PermitType**: Enhance classification accuracy and coverage
   - **PropertyType**: Improve classification accuracy and coverage
   - **Contractor**: Implement deterministic contractor linking from scraped `licensedProfessionalText` data
   - **Contractor Data Enrichment**: Enrich contractor data if we can associate the scraped contractor with an existing contractor and the scraped contractor has additional information that doesn't exist yet
     - When matching a scraped contractor to an existing contractor, check if scraped data has fields missing in DB (e.g., phone, email, address)
     - Update contractor record with missing information from scraped permits
     - This helps build a more complete contractor database over time
   - **Contractor Database**: Import all contractors from the master license data sheet (not just Bay Area counties)
     - Current import only includes Bay Area counties, but permits show contractors from other areas (e.g., Los Angeles, Glendale)
     - Need to expand import to include all California contractors to improve match rates
   - **Contractor Name Field Consistency**: Some companies use BusinessName, some use BUS-NAME-2, some use FullBusinessName in the master license data
     - Need to standardize which field to use for contractor names during import
     - May need to implement a fallback strategy (e.g., use BusinessName if available, otherwise BUS-NAME-2, otherwise FullBusinessName)
     - This affects contractor matching accuracy since name variations can prevent matches

### Email Integration (Non-Deliverability)
   - **Email sending end-to-end MVP**: Send daily permits email to specific address for specific date ✅
   - **Polish email design and content**: Improve email template styling, layout, and readability
   - Implement notification system for permit updates/alerts

### PermitType-Contractor Classification Mapping
   - Organize PermitType structure to enable smart contractor matching
   - Map permit types (e.g., ADU) to relevant contractor classifications (e.g., ELECTRICAL)
   - Create relationship system where contractors with ELECTRICAL classification can be matched to ADU permits

### Subscription Management UI
   - **Show subscription end date**: Display when subscription will end if user has canceled
     - When subscription has `cancel_at` or `cancel_at_period_end: true`, show expiration date in UI
     - Display in pricing page, header, or subscription management area
     - Show message like "Your premium access will end on [date]"
     - Update UI when subscription status changes

### SEO & Security
   - **SEO**: Implement search engine optimization
     - Meta tags, Open Graph tags
     - Structured data (JSON-LD)
     - Sitemap generation
     - Robots.txt configuration
   - **Bot Protection**: Implement measures to prevent bot access
     - Rate limiting
     - CAPTCHA or similar verification
     - IP-based blocking for suspicious activity

## 🔄 Other Pending Tasks

### Core Features
- [ ] **TODO #4**: Build premium natural language search feature - integrate AI/LLM for advanced query processing
- [ ] **TODO #7**: Implement 7-day trial for new users - add trial logic to subscription model and UI
- [ ] Handle Morgan Hill pagination: pageSize is 10 and it only allows 5 pages maximum (need to handle this limitation properly)
- [ ] **City Update Cadence Display**: Inform users about mapping from city to update cadence (DAILY or MONTHLY)
  - Create city-to-cadence mapping system
  - Display update frequency information in UI
  - Potentially add visual map showing cities with their update cadence
- [ ] **City Reporting Pages**: Create reporting/dashboard page per city
  - Display city-specific permit statistics and analytics
  - Show permit trends, counts by type, status breakdowns
  - Enable city-level insights and data visualization


## 📊 Classification Status by City

| City | PermitType Classification | PropertyType Classification | Contractor Matching |
|------|---------------------------|----------------------------|---------------------|
| Los Gatos | ⚠️ | ⚠️ | ✅ (tested) |
| Saratoga | ⚠️ | ⚠️ | ✅ (tested) |
| Santa Clara | ⚠️ | ⚠️ | ✅ (tested) |
| Cupertino | ⚠️ | ⚠️ | ✅ (tested - contractor license search) |
| Palo Alto | ⚠️ | ⚠️ | ✅ (tested - contractor license search) |
| Los Altos Hills | ⚠️ | ⚠️ | ✅ (tested) |
| Sunnyvale | ⚠️ | ✅ | ❌ (not available) |
| San Jose | ⚠️ | ✅ | ✅ (tested) |
| Campbell | ⚠️ | ⚠️ | ❌ (not extracted) |
| Mountain View | ⚠️ | ⚠️ | ✅ (tested) |
| Gilroy | ⚠️ | ✅ | ✅ (tested) |
| Milpitas | ⚠️ | ⚠️ | ✅ (tested) |
| Morgan Hill | ⚠️ | ⚠️ | ✅ (tested) |
| Los Altos | ⚠️ | ⚠️ | ✅ (tested) |

**Legend:**
- ✅ = Implemented and working
- ⚠️ = Needs verification/testing
- ❌ = Not implemented/not available

**Notes:**
- **PermitType & PropertyType**: All cities use the same classification service, so classification works for all cities
- **Contractor Matching**: Depends on whether `licensedProfessionalText` is extracted by each extractor. Most extractors support this, but some may need verification.

---

## ✅ Completed Tasks

- [x] **TODO #1**: Implement permit web scraping functionality - daily scheduler to scrape permit websites and store data
- [x] **TODO #5**: Create permit filtering and search UI - allow users to filter/view permit information
- [x] **TODO #6**: Determine project type from permit data - analyze permit descriptions, titles, and types to categorize projects (residential, commercial, infrastructure, etc.)
- [x] **TODO #9**: Create Contractor entity - add Contractor model (with classifications) and join to Permit
- [x] **TODO #10**: Populate contractor entities - imported contractors via CSV script
- [x] **TODO #11**: Link permits to contractors - current, intentional approach uses randomized classifier association for sampling/testing
- [x] **TODO #14**: Add subscription model to Prisma schema - define Subscription model with user relationship, plan type, status, and limits
- [x] **TODO #15**: Implement freemium GraphQL logic - limit permit results to 3 permits for freemium users, unlimited for premium
- [x] Table view with expandable rows for permit details (lazy-load details)
- [x] Refactor: extract `PermitDetailView` component with self-contained GraphQL fetching and caching
- [x] Pagination for search results (page size=2 for testing)
- [x] Sorting on result table (Type, Property, City, Value, Issue Date, Status)
- [x] Freemium notice banner in UI (callout for limited results)
- [x] Freemium-sticky sorting/pagination: cache 3-permit subset and sort/page locally
- [x] Expose contractors in GraphQL and render in permit expanded detail view
- [x] **Incremental Scraping**: Implemented for ID-based extractors
  - Track largest permit suffix for each prefix to determine starting batch
  - Calculate starting batch: if suffix is last in batch, start at next batch; otherwise start at current batch
  - Load existing permit numbers to track new vs existing permits
  - Limit now represents newly added permits, not total extracted
  - Navigate to first page after each search to prevent pagination issues
- [x] **Stripe Integration**: Setup checkout flow, upgrade CTA, webhooks, payment processing, production testing, and sign up flow
- [x] **TODO #3**: Implement freemium vs premium logic - limit search results for freemium users (partial entries only)
- [x] Learn more / Upgrade flow CTA for freemium banner
- [x] **Deploy to production**: Setup production environment and deployment pipeline
- [x] **Local script execution with production sync**: Enable running scripts locally and syncing with production DB
- [x] **Shovels Data Source**: Research Shovels service/platform as a potential data source for contractor information
- [x] **Contractor-Based Permit Search**: Implement contractor license-based search for cities that support it (Saratoga, Cupertino, Palo Alto)
- [x] **Email sending end-to-end MVP**: Send daily permits email to specific address for specific date
- [x] **Scraper Bug Fixes**: Fixed all scraper issues
  - Campbell scraper pagination issue: Added pagination support to navigate through all result pages instead of stopping at first page (100 permits)
  - Mountain View scraper count discrepancy: Issue resolved
  - ID-based scraper date range fix: ID-based scrapers now skip to next prefix when permit applied date exceeds end date
- [x] **Contact Us Flow**: Implemented contact modal with form submission
- [x] **Features Voting Page**: Implemented features voting modal with voting functionality
- [x] **Pricing Tab/Page**: Created pricing page with plan comparison, FAQ, and upgrade flow
- [x] **Subscription Management**: Implemented subscription management via Stripe Customer Portal
  - Users can cancel subscriptions through Stripe Customer Portal
  - Webhook handler processes subscription updates and cancellations
  - Subscription status tracked in database

*Last updated: 2025-01-20*
