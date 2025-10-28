# Permit Scraper

Scraping system for collecting permit data from various government websites.

## Architecture

### Folder Structure
```
scraper/
├── types.ts              # TypeScript types for scraping
├── config/
│   └── cities.ts        # City to extractor mapping
├── extractors/          # Individual city extractors
│   ├── san-francisco.ts
│   └── oakland.ts
├── base-extractor.ts    # Abstract base class for extractors
├── extractor-factory.ts # Factory to create extractors
├── index.ts             # Main orchestrator
└── README.md
```

### Key Components

1. **City Configuration** (`config/cities.ts`)
   - Maps cities to their extractors
   - Defines which cities are enabled for scraping
   - Centralized configuration

2. **Extractors** (`extractors/*.ts`)
   - Each city has its own extractor class
   - Extends `BaseExtractor`
   - Implements city-specific scraping logic

3. **Orchestrator** (`index.ts`)
   - Manages scraping across multiple cities
   - Saves data to database
   - Handles errors and logging

## Adding a New City

1. **Create the extractor** (`extractors/[city-name].ts`):
   ```typescript
   import { BaseExtractor } from "../base-extractor";
   
   export class CityNameExtractor extends BaseExtractor {
     async scrape(): Promise<ScrapeResult> {
       // Implement scraping logic
     }
     
     protected parsePermitData(rawData: any): PermitData[] {
       // Parse and return permit data
     }
   }
   ```

2. **Add to factory** (`extractor-factory.ts`):
   ```typescript
   import { CityNameExtractor } from "./extractors/city-name";
   
   switch (config.extractor) {
     case "CityNameExtractor":
       return new CityNameExtractor(config.city, config.state, config.url);
   }
   ```

3. **Add city config** (`config/cities.ts`):
   ```typescript
   {
     city: "City Name",
     state: "ST",
     extractor: "CityNameExtractor",
     url: "https://city-website.com/permits",
     enabled: true,
   }
   ```

## Usage

### Scrape all cities
```bash
pnpm scrape
```

### Scrape specific city
```bash
pnpm scrape "San Francisco"
```

## Implementation Notes

- **Extractors are placeholders**: You need to implement actual scraping logic for each city
- **Scraping methods vary**: Some cities have APIs, others need HTML parsing
- **Rate limiting**: Consider adding delays between requests to respect website limits
- **Error handling**: Each extractor should handle errors gracefully
- **Data validation**: Ensure scraped data matches database schema

## Next Steps

1. Implement actual scraping logic for each city
2. Add rate limiting and retry logic
3. Set up a scheduler (cron job) for periodic scraping
4. Add monitoring and alerting
5. Handle edge cases and data cleaning

