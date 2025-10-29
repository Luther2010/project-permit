# Project Permit - TODO List

## ✅ Completed Tasks

- [x] **TODO #1**: Implement permit web scraping functionality - daily scheduler to scrape permit websites and store data
- [x] **TODO #6**: Determine project type from permit data - analyze permit descriptions, titles, and types to categorize projects (residential, commercial, infrastructure, etc.)
- [x] **TODO #14**: Add subscription model to Prisma schema - define Subscription model with user relationship, plan type, status, and limits
- [x] **TODO #15**: Implement freemium GraphQL logic - limit permit results to 3 permits for freemium users, unlimited for premium

## 🔄 Pending Tasks

### Core Features
- [ ] **TODO #2**: Add Stripe payment integration - setup checkout flow for freemium to premium upgrade
- [ ] **TODO #3**: Implement freemium vs premium logic - limit search results for freemium users (partial entries only)
- [ ] **TODO #4**: Build premium natural language search feature - integrate AI/LLM for advanced query processing
- [ ] **TODO #5**: Create permit filtering and search UI - allow users to filter/view permit information
- [ ] **TODO #7**: Implement 7-day trial for new users - add trial logic to subscription model and UI

### Data Enhancement
- [ ] **TODO #8**: Improve permit classification logic - enhance accuracy of PropertyType and PermitType classification using ML/AI, better keyword matching, and external data sources

### Contractor Management
- [ ] **TODO #9**: Create Contractor entity - add Contractor model to Prisma schema with fields like name, license, specialties, contact info
- [ ] **TODO #10**: Populate contractor entities - scrape and extract contractor information from permit data and external sources
- [ ] **TODO #11**: Link permits to contractors - establish relationships between existing permits and contractor entities based on contractor info in permit data

### UI/UX Enhancements
- [ ] **TODO #12**: Allow sorting on filtered result table - implement sortable columns for permit data (date, value, type, property type, etc.)
- [ ] **TODO #13**: Enable pagination in filter results - implement pagination controls and page-based navigation for large permit datasets

## 📝 Notes

- **Subscription Model**: Simplified to use only `plan` and `validUntil` fields (no cleanup scripts needed)
- **Authentication**: Using `session.user.id` for secure, provider-agnostic user identification
- **Freemium Logic**: 3 permits for non-premium users, unlimited for premium users
- **Classification**: PropertyType and PermitType classification working with 80-90% confidence

## 🎯 Next Priority

Consider working on:
1. **TODO #5**: Create permit filtering and search UI (high user value)
2. **TODO #9**: Create Contractor entity (data expansion)
3. **TODO #12**: Allow sorting on filtered result table (UX improvement)

---

*Last updated: 2025-01-29*
