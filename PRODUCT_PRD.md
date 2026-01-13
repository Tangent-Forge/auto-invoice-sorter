# PRODUCT PRD: Auto-Invoice Sorter

## 1. Executive Summary

**Auto-Invoice Sorter** is an automation tool that identifies invoice files in Google Drive, extracts key metadata (vendor, date, amount), and automatically organizes them into a structured folder hierarchy with consistent naming conventions.

## 2. Target Persona

- **Field Teams**: Processing invoices from multiple vendors
- **Finance Teams**: Managing vendor payments and tracking
- **Operations Teams**: Handling receipts and documentation
- **Small Business Owners**: Tracking expenses and payments

## 3. Core Features (v1.0)

- **Invoice Scanner**: Scan Drive for files matching invoice patterns
- **Metadata Extractor**: Parse vendor, date, and amount from file names/content
- **Auto-Sorter**: Create vendor folders and move files accordingly
- **Renamer**: Apply consistent naming convention (Vendor_YYYY-MM-DD_Amount.pdf)
- **Duplicate Detector**: Identify and flag potential duplicate invoices

## 4. Technical Architecture

- **Framework**: Apps Script with `Drive` API (v3)
- **Performance**: Use `pageSize` and `nextPageToken` for efficient scanning
- **Data Persistence**: Google Sheet for processing logs

## 5. Build Checklist (v1.0 Build-Out)

- [ ] **BUILD-001**: Implement `InvoiceScanner.gs` - Query `Drive.Files.list` with invoice name patterns
- [ ] **BUILD-002**: Implement `MetadataExtractor.gs` - Parse vendor, date, amount from filenames
- [ ] **BUILD-003**: Implement `AutoSorter.gs` - Create folder structure and move files
- [ ] **BUILD-004**: UI: "Invoice Sorter" Sidebar with scan and sort controls
- [ **BUILD-005**: Reporting: "Processing Log" export to Sheets

---
*Status: Initial Planning | Readiness: Agent-Ready (Scaffold Tier)*
