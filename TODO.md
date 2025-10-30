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
- [x] **TODO #11**: Link permits to contractors - current classifier performs randomized association for sampling/testing

## 🔄 Pending Tasks

### Core Features
- [ ] **TODO #2**: Add Stripe payment integration - setup checkout flow for freemium to premium upgrade
- [ ] **TODO #3**: Implement freemium vs premium logic - limit search results for freemium users (partial entries only)
- [ ] **TODO #4**: Build premium natural language search feature - integrate AI/LLM for advanced query processing
- [ ] **TODO #7**: Implement 7-day trial for new users - add trial logic to subscription model and UI

### Data Enhancement
- [ ] **TODO #8**: Improve permit classification logic - enhance accuracy of PropertyType and PermitType classification using ML/AI, better keyword matching, and external data sources
- [ ] Improve contractor linking: parse `licensedProfessionalText` to deterministically match `licenseNo`/name and create `PermitContractor` rows

### UI/UX Enhancements
- [ ] Learn more / Upgrade flow CTA for freemium banner

## 📝 Notes

- **Subscription Model**: Simplified to use only `plan` and `validUntil` fields (no cleanup scripts needed)
- **Authentication**: Using `session.user.id` for secure, provider-agnostic user identification
- **Freemium Logic**: 3 permits for non-premium users, unlimited for premium users; for freemium we lock the same 3-permit subset (canonical: Issue Date DESC) and sort/page locally so sorting doesn’t change the subset
- **Classification**: PropertyType and PermitType classification working with 80-90% confidence
- **Contractors**: Prisma models for `Contractor`, `ContractorClassification`, and `PermitContractor` are in place; GraphQL exposes `Permit.contractors`; UI shows contractor details in expanded view. Contractor import is done; current linking uses randomized classifier association.

## 🎯 Next Priority

Consider working on:
1. **TODO #2**: Stripe payment + upgrade flow (connect banner CTA)
2. Improve contractor linking deterministically from scraped text
3. **TODO #7**: 7-day trial UX and enforcement

---

*Last updated: 2025-10-30*
