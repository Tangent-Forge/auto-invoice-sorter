/**
 * Auto Invoice Sorter - Google Workspace Add-on
 * Automatically identifies, sorts, and renames invoice files in Google Drive
 */

const UI_LABEL = 'Auto Invoice Sorter';

// ========================================
// Add-on Initialization
// ========================================

/**
 * Called when the add-on is installed
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * Called when Drive is opened
 */
function onOpen(e) {
  DocumentApp.getUi()
    .createMenu('Auto Invoice Sorter')
    .addItem('Show Sorter', 'showSidebar')
    .addItem('Scan Folder', 'scanFolder')
    .addToUi();
}

/**
 * Opens the sidebar
 */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle(UI_LABEL);
  DocumentApp.getUi().showSidebar(html);
}

// ========================================
// API Functions (Called from Sidebar)
// ========================================

/**
 * API: Scan folder for invoices
 */
function apiScanFolder(folderId) {
  try {
    const results = scanFolder(folderId || 'root');
    return results;
  } catch (err) {
    console.error('Scan failed:', err);
    throw new Error('Scan failed: ' + err.message);
  }
}

/**
 * API: Sort invoices
 */
function apiSortInvoices(invoiceIds) {
  try {
    const results = AutoSorter.sortInvoices(invoiceIds);
    return results;
  } catch (err) {
    console.error('Sort failed:', err);
    throw new Error('Sort failed: ' + err.message);
  }
}

/**
 * API: Export processing log
 */
function apiExportLog() {
  try {
    const logUrl = ReportWriter.exportLog();
    return { success: true, url: logUrl };
  } catch (err) {
    console.error('Export failed:', err);
    throw new Error('Export failed: ' + err.message);
  }
}

// ========================================
// Core Logic
// ========================================

/**
 * Scan folder for invoice files
 */
function scanFolder(folderId = 'root') {
  const config = SorterConfig;
  const invoices = [];
  let pageToken = null;
  let pageCount = 0;
  
  do {
    const response = Drive.Files.list({
      q: `trashed = false and mimeType contains 'pdf' or mimeType contains 'image'`,
      pageSize: 200,
      pageToken,
      fields: 'files(id,name,mimeType,parents,createdTime,modifiedTime),nextPageToken',
      spaces: 'drive',
      corpora: 'drive'
    });
    
    if (response.files) {
      response.files.forEach(file => {
        const metadata = MetadataExtractor.extractMetadata(file.name);
        if (metadata.isInvoice) {
          invoices.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            parentFolder: file.parents && file.parents[0],
            createdTime: file.createdTime,
            modifiedTime: file.modifiedTime,
            metadata
          });
        }
      });
    }
    
    pageToken = response.nextPageToken;
    pageCount++;
  } while (pageToken && pageCount < config.maxPages);
  
  // Check for duplicates
  const duplicates = DuplicateDetector.findDuplicates(invoices);
  
  return {
    success: true,
    invoices,
    duplicates,
    totalFound: invoices.length,
    scanAt: new Date().toISOString()
  };
}

// ========================================
// Configuration
// ========================================

const SorterConfig = {
  /**
   * Invoice name patterns
   */
  invoicePatterns: [
    /invoice/i,
    /receipt/i,
    /bill/i,
    /statement/i,
    /purchase order/i,
    /po_\d+/i
  ],
  
  /**
   * Date formats to parse
   */
  dateFormats: [
    'YYYY-MM-DD',
    'YYYY/MM/DD',
    'MM-DD-YYYY',
    'MM/DD/YYYY',
    'DD-MM-YYYY',
    'DD/MM/YYYY',
    'YYYYMMDD'
  ],
  
  /**
   * Amount patterns
   */
  amountPatterns: [
    /\$?[\d,]+\.?\d*/,
    /amount[:\s]*[\d,]+\.?\d*/i,
    /total[:\s]*[\d,]+\.?\d*/i
  ],
  
  /**
   * Folder naming convention
   */
  folderNaming: '{vendor}',
  
  /**
   * File naming convention
   */
  fileNaming: '{vendor}_{date}_{amount}.{ext}',
  
  /**
   * Maximum pages to scan
   */
  maxPages: 50,
  
  /**
   * Duplicate similarity threshold (0-1)
   */
  duplicateThreshold: 0.9
};

// ========================================
// Metadata Extractor Module
// ========================================

const MetadataExtractor = (() => {
  function extractMetadata(filename) {
    const metadata = {
      isInvoice: false,
      vendor: null,
      date: null,
      amount: null,
      confidence: 0
    };
    
    // Check if it's an invoice
    const isInvoice = SorterConfig.invoicePatterns.some(pattern => pattern.test(filename));
    if (!isInvoice) {
      return metadata;
    }
    
    metadata.isInvoice = true;
    
    // Extract vendor (first word before invoice keywords)
    const vendorMatch = filename.match(/^([A-Za-z][A-Za-z0-9\s&]+?)(?:invoice|receipt|bill|statement|po)/i);
    if (vendorMatch) {
      metadata.vendor = vendorMatch[1].trim().replace(/[^a-zA-Z0-9\s&]/g, '');
    }
    
    // Extract date
    const dateMatch = filename.match(/(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|\d{8})/);
    if (dateMatch) {
      metadata.date = parseDate(dateMatch[1]);
    }
    
    // Extract amount
    const amountMatch = filename.match(/[\$]?([\d,]+\.?\d*)/);
    if (amountMatch) {
      metadata.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }
    
    // Calculate confidence
    let confidence = 0.5;
    if (metadata.vendor) confidence += 0.2;
    if (metadata.date) confidence += 0.2;
    if (metadata.amount) confidence += 0.1;
    metadata.confidence = confidence;
    
    return metadata;
  }
  
  function parseDate(dateString) {
    // Try different date formats
    const formats = [
      /(\d{4})[-/](\d{2})[-/](\d{2})/,
      /(\d{2})[-/](\d{2})[-/](\d{4})/,
      /(\d{8})/
    ];
    
    for (const format of formats) {
      const match = dateString.match(format);
      if (match) {
        let year, month, day;
        if (format === formats[2]) { // YYYYMMDD
          year = match[1].substring(0, 4);
          month = match[1].substring(4, 6);
          day = match[1].substring(6, 8);
        } else if (format === formats[1]) { // MM-DD-YYYY or MM/DD/YYYY
          month = match[1];
          day = match[2];
          year = match[3];
        } else { // YYYY-MM-DD or YYYY/MM/DD
          year = match[1];
          month = match[2];
          day = match[3];
        }
        return `${year}-${month}-${day}`;
      }
    }
    
    return null;
  }
  
  return {
    extractMetadata
  };
})();

// ========================================
// Auto Sorter Module
// ========================================

const AutoSorter = (() => {
  function sortInvoices(invoiceIds) {
    const results = [];
    const processedFolders = new Set();
    
    invoiceIds.forEach(invoiceId => {
      try {
        const file = DriveApp.getFileById(invoiceId);
        const metadata = MetadataExtractor.extractMetadata(file.getName());
        
        // Create vendor folder
        const vendorName = metadata.vendor || 'Unknown';
        const folderName = vendorName.replace(/\s+/g, ' ').trim();
        
        let targetFolder;
        const folderPattern = SorterConfig.folderNaming.replace('{vendor}', folderName);
        
        // Check if folder exists
        const folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) {
          targetFolder = folders.next();
        } else {
          // Create folder in root
          targetFolder = DriveApp.createFolder(folderName);
        }
        
        // Generate new filename
        const ext = file.getName().split('.').pop();
        const dateStr = metadata.date || new Date().toISOString().split('T')[0];
        const amountStr = metadata.amount ? metadata.amount.toFixed(2) : '0.00';
        const newName = Sorter.fileNaming
          .replace('{vendor}', vendorName.replace(/\s+/g, '_'))
          .replace('{date}', dateStr)
          .replace('{amount}', amountStr)
          .replace('{ext}', ext);
        
        // Move file to target folder
        file.moveTo(targetFolder);
        file.setName(newName);
        
        processedFolders.add(folderName);
        
        results.push({
          invoiceId,
          success: true,
          originalName: file.getName(),
          newName: newName,
          folder: folderName,
          message: 'Sorted successfully'
        });
        
        // Log the action
        AuditLogger.logSort({
          invoiceId,
          originalName: file.getName(),
          newName,
          folder: folderName,
          timestamp: new Date().toISOString()
        });
        
      } catch (err) {
        results.push({
          invoiceId,
          success: false,
          message: err.message
        });
      }
    });
    
    return {
      success: true,
      results,
      processedFolders: Array.from(processedFolders),
      totalProcessed: invoiceIds.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };
  }
  
  return {
    sortInvoices
  };
})();

// ========================================
// Duplicate Detector Module
// ========================================

const DuplicateDetector = (() => {
  function findDuplicates(invoices) {
    const duplicates = [];
    
    for (let i = 0; i < invoices.length; i++) {
      for (let j = i + 1; j < invoices.length; j++) {
        const similarity = calculateSimilarity(invoices[i], invoices[j]);
        if (similarity >= SorterConfig.duplicateThreshold) {
          const existing = duplicates.find(d => 
            d.includes(invoices[i].id) || d.includes(invoices[j].id)
          );
          
          if (!existing) {
            duplicates.push([invoices[i].id, invoices[j].id]);
          }
        }
      }
    }
    
    return duplicates;
  }
  
  function calculateSimilarity(invoice1, invoice2) {
    let score = 0;
    
    // Vendor match
    if (invoice1.metadata.vendor && invoice2.metadata.vendor) {
      if (invoice1.metadata.vendor.toLowerCase() === invoice2.metadata.vendor.toLowerCase()) {
        score += 0.4;
      }
    }
    
    // Date match
    if (invoice1.metadata.date && invoice2.metadata.date) {
      if (invoice1.metadata.date === invoice2.metadata.date) {
        score += 0.3;
      }
    }
    
    // Amount match
    if (invoice1.metadata.amount && invoice2.metadata.amount) {
      if (invoice1.metadata.amount === invoice2.metadata.amount) {
        score += 0.3;
      }
    }
    
    return score;
  }
  
  return {
    findDuplicates
  };
})();

// ========================================
// Audit Logger
// ========================================

const AuditLogger = (() => {
  const logKey = 'sortLog';
  
  function logSort(action) {
    const properties = PropertiesService.getScriptProperties();
    const existingLog = JSON.parse(properties.getProperty(logKey) || '[]');
    existingLog.push(action);
    properties.setProperty(logKey, JSON.stringify(existingLog));
  }
  
  function getLog() {
    const properties = PropertiesService.getScriptProperties();
    return JSON.parse(properties.getProperty(logKey) || '[]');
  }
  
  return {
    logSort,
    getLog
  };
})();

// ========================================
// Report Writer
// ========================================

const ReportWriter = (() => {
  function exportLog() {
    const log = AuditLogger.getLog();
    const ss = SpreadsheetApp.create('Invoice Sorter Log - ' + new Date().toLocaleDateString());
    const sheet = ss.getSheets()[0];
    
    // Header
    sheet.appendRow(['Timestamp', 'Invoice ID', 'Original Name', 'New Name', 'Folder']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#0097A7').setFontColor('#FFFFFF');
    
    // Data
    log.forEach(entry => {
      sheet.appendRow([
        entry.timestamp,
        entry.invoiceId,
        entry.originalName,
        entry.newName,
        entry.folder
      ]);
    });
    
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 5);
    
    return ss.getUrl();
  }
  
  return {
    exportLog
  };
})();
