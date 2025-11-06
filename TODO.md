# Project Permit - TODO List

## ✅ Completed Tasks

- [x] **TODO #1**: Implement permit web scraping functionality - daily scheduler to scrape permit websites and store data
- [x] **TODO #5**: Create permit filtering and search UI - allow users to filter/view permit information
- [x] **TODO #6**: Determine project type from permit data - analyze permit descriptions, titles, and types to categorize projects (residential, commercial, infrastructure, etc.)
- [x] **TODO #14**: Add subscription model to Prisma schema - define Subscription model with user relationship, plan type, status, and limits
- [x] **TODO #15**: Implement freemium GraphQL logic - limit permit results to 3 permits for freemium users, unlimited for premium
- [x] Table view with expandable rows for permit details (lazy-load details)
- [x] Refactor: extract `PermitDetailView` component with self-contained GraphQL fetching and caching
- [x] Pagination for search results (page size=2 for testing)
- [x] Sorting on result table (Type, Property, City, Value, Issue Date, Status)
- [x] Freemium notice banner in UI (callout for limited results)
- [x] Freemium-sticky sorting/pagination: cache 3-permit subset and sort/page locally
- [x] **TODO #9**: Create Contractor entity - add Contractor model (with classifications) and join to Permit
- [x] Expose contractors in GraphQL and render in permit expanded detail view
- [x] **TODO #10**: Populate contractor entities - imported contractors via CSV script
- [x] **TODO #11**: Link permits to contractors - current, intentional approach uses randomized classifier association for sampling/testing
- [x] **Incremental Scraping**: Implemented for ID-based extractors
  - Track largest permit suffix for each prefix to determine starting batch
  - Calculate starting batch: if suffix is last in batch, start at next batch; otherwise start at current batch
  - Load existing permit numbers to track new vs existing permits
  - Limit now represents newly added permits, not total extracted
  - Navigate to first page after each search to prevent pagination issues

## 🎯 Main Priorities

1. **Stripe Integration**
   - Setup checkout flow for freemium to premium upgrade
   - Connect upgrade CTA in freemium banner
   - Handle subscription webhooks and payment processing

2. **Classification Improvements**
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
   - **Monthly Document Contractor Extraction**: Some cities' portals don't have contractor info, but they release monthly documents (PDFs/reports) that contain contractor information
     - Cupertino: Portal doesn't show contractor info, but monthly documents DO have contractor info
     - Need to implement monthly document extraction for Cupertino (similar to Mountain View's monthly PDF extraction approach)
     - Identify other cities that may have contractor info in monthly documents
   - **Shovels Data Source**: Research Shovels service/platform as a potential data source for contractor information
     - Shovels reportedly has contractor info for Cupertino and Palo Alto
     - Need to investigate Shovels API/access methods and data format
     - Could potentially supplement or replace monthly document extraction for these cities
   - **Contractor-Based Permit Search**: Some cities support searching permits by contractor ID/name, but don't show contractor info on permit detail pages
     - Cities: Saratoga, Cupertino, Palo Alto
     - Strategy: Implement contractor-based search as a complementary approach
     - Approach A (Recommended): Hybrid - Continue date-based scraping for all permits (primary), plus periodic contractor-based search to link contractors (secondary)
     - Approach B: Contractor-based scraping - Search by contractor ID from our database to find associated permits
     - Considerations:
       * Use our contractor database to determine which contractors to search
       * Run contractor-based linking less frequently (weekly/monthly) to avoid rate limiting
       * Focus on active contractors (those with recent permits) for efficiency
       * Can be run as a background job separate from daily permit scraping

3. **Email Integration**
   - Setup email sending functionality
   - Implement notification system for permit updates/alerts

4. **PermitType-Contractor Classification Mapping**
   - Organize PermitType structure to enable smart contractor matching
   - Map permit types (e.g., ADU) to relevant contractor classifications (e.g., ELECTRICAL)
   - Create relationship system where contractors with ELECTRICAL classification can be matched to ADU permits

## 🔄 Other Pending Tasks

### Core Features
- [ ] **TODO #3**: Implement freemium vs premium logic - limit search results for freemium users (partial entries only)
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

### UI/UX Enhancements
- [ ] Learn more / Upgrade flow CTA for freemium banner

## 📊 Classification Status by City

| City | PermitType Classification | PropertyType Classification | Contractor Matching |
|------|---------------------------|----------------------------|---------------------|
| Los Gatos | ✅ | ✅ | ✅ (tested) |
| Saratoga | ✅ | ✅ | ✅ (tested) |
| Santa Clara | ✅ | ✅ | ✅ (tested) |
| Cupertino | ✅ | ✅ | ⚠️ (portal: not available, monthly docs: confirmed to have) |
| Palo Alto | ✅ | ✅ | ❌ (not available on portal, no monthly docs) |
| Los Altos Hills | ✅ | ✅ | ⚠️ (implemented, needs testing) |
| Sunnyvale | ✅ | ✅ | ⚠️ (implemented, needs testing) |
| San Jose | ✅ | ✅ | ⚠️ (implemented, needs testing) |
| Campbell | ✅ | ✅ | ❌ (not extracted) |
| Mountain View | ✅ | ✅ | ⚠️ (implemented, needs testing) |
| Gilroy | ✅ | ✅ | ⚠️ (implemented, needs testing) |
| Milpitas | ✅ | ✅ | ✅ (tested) |
| Morgan Hill | ✅ | ✅ | ✅ (tested) |
| Los Altos | ✅ | ✅ | ⚠️ (implemented, needs testing) |

**Legend:**
- ✅ = Implemented and working
- ⚠️ = Needs verification/testing
- ❌ = Not implemented/not available

**Notes:**
- **PermitType & PropertyType**: All cities use the same classification service, so classification works for all cities
- **Contractor Matching**: Depends on whether `licensedProfessionalText` is extracted by each extractor. Most extractors support this, but some may need verification.

## 📝 Notes

- **Subscription Model**: Simplified to use only `plan` and `validUntil` fields (no cleanup scripts needed)
- **Authentication**: Using `session.user.id` for secure, provider-agnostic user identification
- **Freemium Logic**: 3 permits for non-premium users, unlimited for premium users; for freemium we lock the same 3-permit subset (canonical: Issue Date DESC) and sort/page locally so sorting doesn't change the subset
- **Classification**: PropertyType and PermitType classification working with 80-90% confidence
- **Contractors**: Prisma models for `Contractor`, `ContractorClassification`, and `PermitContractor` are in place; GraphQL exposes `Permit.contractors`; UI shows contractor details in expanded view. Contractor import is done; current linking is randomized (by design for now).

---

*Last updated: 2025-01-31*
