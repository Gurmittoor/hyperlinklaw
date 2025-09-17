/**
 * HTML Exhibit Generator Service
 * Generates interactive HTML pages for exhibit-based documents
 * Similar to htmlIndexGenerator but specifically for exhibits (A, B, C, 1, 2, 3, etc.)
 */

interface ExhibitItem {
    exhibitLabel: string;     // "A", "B", "1", "A-1", etc.
    exhibitTitle?: string;    // Optional descriptive title
    pageNumber: number;       // Page where exhibit appears
    ocrDetected: boolean;     // Was it auto-detected
    manuallyAdded: boolean;   // Was it manually added
}

export class HtmlExhibitGenerator {
    private exhibits: ExhibitItem[];
    private documentId: string;
    private totalPages: number;

    constructor(exhibits: ExhibitItem[], documentId: string, totalPages: number) {
        this.exhibits = exhibits.sort((a, b) => {
            // Sort by page number first, then by exhibit label
            if (a.pageNumber !== b.pageNumber) {
                return a.pageNumber - b.pageNumber;
            }
            return a.exhibitLabel.localeCompare(b.exhibitLabel, undefined, { numeric: true });
        });
        this.documentId = documentId;
        this.totalPages = totalPages;
    }

    generateHTML(caseId: string, documentTitle: string = "Document Exhibits"): string {
        const pdfFileName = `/online/pdf/${caseId}/${this.documentId}`;
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📋 Exhibit Index - ${documentTitle}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .content {
            padding: 40px;
        }
        .intro {
            background: #f8f9ff;
            padding: 25px;
            border-radius: 10px;
            margin-bottom: 30px;
            border-left: 5px solid #3498db;
        }
        .intro h2 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 1.4em;
        }
        .intro p {
            color: #5a6c7d;
            line-height: 1.6;
            margin-bottom: 10px;
        }
        .intro code {
            background: #e8ecf3;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            color: #2c3e50;
        }
        .exhibits-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-top: 30px;
        }
        .exhibit-item {
            background: #ffffff;
            border: 2px solid #e1e8ff;
            border-radius: 12px;
            padding: 20px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        .exhibit-item:hover {
            border-color: #3498db;
            transform: translateY(-3px);
            box-shadow: 0 8px 25px rgba(52, 152, 219, 0.15);
        }
        .exhibit-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .exhibit-label {
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 1.1em;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .exhibit-page {
            background: #f8f9ff;
            color: #2c3e50;
            padding: 4px 12px;
            border-radius: 15px;
            font-size: 0.9em;
            font-weight: 600;
        }
        .exhibit-title {
            color: #34495e;
            font-size: 1em;
            line-height: 1.4;
            margin-bottom: 15px;
            min-height: 20px;
            font-style: ${this.exhibits.some(e => e.exhibitTitle) ? 'normal' : 'italic'};
        }
        .edit-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 10px;
            justify-content: space-between;
        }
        .click-instruction {
            color: #3498db;
            text-decoration: none;
            font-weight: 600;
            padding: 8px 16px;
            border-radius: 8px;
            background: #f8f9ff;
            border: 2px solid #e1e8ff;
            transition: all 0.3s;
            flex: 1;
            text-align: center;
            display: block;
        }
        .click-instruction:hover {
            background: #3498db;
            color: white;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
        }
        .edit-button {
            background: #27ae60;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 15px;
            font-size: 0.85em;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
            box-shadow: 0 2px 6px rgba(39, 174, 96, 0.3);
        }
        .edit-button:hover {
            background: #229954;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(39, 174, 96, 0.4);
        }
        .edit-form {
            display: none;
            align-items: center;
            gap: 12px;
            margin-top: 15px;
            padding: 15px;
            background: #f0f8ff;
            border-radius: 10px;
            border: 2px solid #27ae60;
            box-shadow: 0 4px 12px rgba(39, 174, 96, 0.2);
            animation: slideDown 0.3s ease-out;
        }
        .edit-form.active {
            display: flex;
        }
        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .page-input {
            width: 80px;
            padding: 8px 12px;
            border: 2px solid #27ae60;
            border-radius: 6px;
            text-align: center;
            font-weight: bold;
            font-size: 1em;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .page-input:focus {
            outline: none;
            border-color: #229954;
            box-shadow: 0 0 8px rgba(39, 174, 96, 0.3);
        }
        .confirm-btn {
            background: #27ae60;
            color: white;
            border: none;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.8em;
            cursor: pointer;
            font-weight: 500;
        }
        .confirm-btn:hover {
            background: #229954;
        }
        .cancel-btn {
            background: #e74c3c;
            color: white;
            border: none;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.8em;
            cursor: pointer;
            font-weight: 500;
        }
        .cancel-btn:hover {
            background: #c0392b;
        }
        .updating {
            background: #3498db;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.8em;
        }
        .detection-badge {
            position: absolute;
            top: 12px;
            right: 12px;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.7em;
            font-weight: 600;
            text-transform: uppercase;
        }
        .auto-detected {
            background: #e8f5e8;
            color: #27ae60;
            border: 1px solid #c3e6c3;
        }
        .manually-added {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        .footer {
            text-align: center;
            padding: 30px;
            background: #f8f9ff;
            color: #666;
            border-top: 1px solid #e1e8ff;
        }
        .footer p {
            margin: 5px 0;
            font-size: 0.9em;
        }
        @media (max-width: 768px) {
            body { padding: 20px; }
            .header { padding: 30px 20px; }
            .content { padding: 30px 20px; }
            .header h1 { font-size: 2em; }
            .exhibits-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 Clickable Exhibit Index</h1>
            <p>${documentTitle}</p>
        </div>
        
        <div class="content">
            <div class="intro">
                <h2>🎯 How to Use This Exhibit Index</h2>
                <p><strong>Click any exhibit below</strong> to instantly open the PDF at that exact page in a new browser tab.</p>
                <p>Each link opens <code>${pdfFileName}</code> at the specific page containing that exhibit.</p>
                <p><em>Works in any modern browser - Chrome, Firefox, Safari, Edge</em></p>
                <div style="margin-top: 15px; text-align: center;">
                    <button onclick="testEditButton()" style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                        🧪 Test JavaScript (Click Me First!)
                    </button>
                    <p style="font-size: 0.9em; color: #666; margin-top: 8px;">
                        Click this button to verify JavaScript is working before using edit buttons
                    </p>
                </div>
            </div>
            
            <div class="exhibits-grid">
                ${this.exhibits.map(exhibit => `
                    <div class="exhibit-item" id="exhibit-${exhibit.exhibitLabel}">
                        <div class="detection-badge ${exhibit.ocrDetected ? 'auto-detected' : 'manually-added'}">
                            ${exhibit.ocrDetected ? '🤖 Auto' : '👤 Manual'}
                        </div>
                        <div class="exhibit-header">
                            <div class="exhibit-label">
                                📄 Exhibit ${exhibit.exhibitLabel}
                            </div>
                            <div class="exhibit-page">Page ${exhibit.pageNumber}</div>
                        </div>
                        <div class="exhibit-title">${exhibit.exhibitTitle || 'No description available'}</div>
                        <div class="edit-controls">
                            <a href="${pdfFileName}#page=${exhibit.pageNumber}" target="_blank" class="click-instruction" id="link-${exhibit.exhibitLabel}">
                                👆 Click to open PDF at page ${exhibit.pageNumber}
                            </a>
                            <button class="edit-button" onclick="editPage('${exhibit.exhibitLabel}', ${exhibit.pageNumber})">✏️ Edit Page</button>
                        </div>
                        <div class="edit-form" id="edit-form-${exhibit.exhibitLabel}">
                            <label style="font-weight: 600; color: #2E7D32;">📝 New Page Number:</label>
                            <input type="number" class="page-input" id="page-input-${exhibit.exhibitLabel}" min="1" max="${this.totalPages}" value="${exhibit.pageNumber}" placeholder="Page #">
                            <button class="confirm-btn" onclick="confirmEdit('${exhibit.exhibitLabel}')">✅ Update Link</button>
                            <button class="cancel-btn" onclick="cancelEdit('${exhibit.exhibitLabel}')">❌ Cancel</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="footer">
            <p><strong>💡 Tip:</strong> Keep this HTML file in the same folder as your PDF for best results</p>
            <p>Generated by HyperlinkLaw.com • Professional Legal Document Management</p>
            <p><small>Total: ${this.exhibits.length} clickable exhibit references</small></p>
        </div>
    </div>

    <script>
        // Global variables
        window.currentDocumentId = '${this.documentId}';
        window.currentCaseId = '${caseId}';
        
        // Edit page function
        window.editPage = function(exhibitLabel, currentPage) {
            console.log('🎯 Edit button clicked for Exhibit ' + exhibitLabel);
            
            // Hide all edit forms first
            var allForms = document.querySelectorAll('.edit-form');
            for (var i = 0; i < allForms.length; i++) {
                allForms[i].classList.remove('active');
            }
            
            // Show this edit form
            var editForm = document.getElementById('edit-form-' + exhibitLabel);
            if (editForm) {
                editForm.classList.add('active');
                console.log('✅ Edit form shown for Exhibit ' + exhibitLabel);
                
                // Focus on input after short delay
                setTimeout(function() {
                    var input = document.getElementById('page-input-' + exhibitLabel);
                    if (input) {
                        input.focus();
                        input.select();
                        console.log('📝 Input focused for Exhibit ' + exhibitLabel);
                    }
                }, 150);
            } else {
                console.error('❌ Edit form not found for Exhibit ' + exhibitLabel);
            }
        };
        
        // Cancel edit function
        window.cancelEdit = function(exhibitLabel) {
            console.log('❌ Cancel button clicked for Exhibit ' + exhibitLabel);
            var editForm = document.getElementById('edit-form-' + exhibitLabel);
            if (editForm) {
                editForm.classList.remove('active');
                console.log('✅ Edit form hidden for Exhibit ' + exhibitLabel);
            }
        };
        
        // Confirm edit function
        window.confirmEdit = function(exhibitLabel) {
            console.log('✅ Confirm edit for Exhibit ' + exhibitLabel);
            
            var input = document.getElementById('page-input-' + exhibitLabel);
            var newPage = parseInt(input.value);
            
            if (!newPage || newPage < 1 || newPage > ${this.totalPages}) {
                alert('Please enter a valid page number between 1 and ${this.totalPages}');
                return;
            }
            
            console.log('📤 Making API request to update Exhibit ' + exhibitLabel + ' to page ' + newPage);
            
            // Show updating state
            var editForm = document.getElementById('edit-form-' + exhibitLabel);
            editForm.innerHTML = '<div class="updating">🔄 Updating exhibit hyperlink...</div>';
            
            // Make API request to update exhibit page
            fetch('/api/documents/' + window.currentDocumentId + '/update-exhibit-page', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    exhibitLabel: exhibitLabel,
                    newPage: newPage,
                    caseId: window.currentCaseId
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log('✅ API Response:', data);
                if (data.success) {
                    // Update the link and UI
                    var link = document.getElementById('link-' + exhibitLabel);
                    var pageDisplay = document.querySelector('#exhibit-' + exhibitLabel + ' .exhibit-page');
                    
                    if (link && pageDisplay) {
                        link.href = '${pdfFileName}#page=' + newPage;
                        link.textContent = '👆 Click to open PDF at page ' + newPage;
                        pageDisplay.textContent = 'Page ' + newPage;
                        console.log('🔗 Link updated successfully for Exhibit ' + exhibitLabel);
                    }
                    
                    // Hide edit form
                    editForm.classList.remove('active');
                    editForm.innerHTML = \`
                        <label style="font-weight: 600; color: #2E7D32;">📝 New Page Number:</label>
                        <input type="number" class="page-input" id="page-input-\${exhibitLabel}" min="1" max="${this.totalPages}" value="\${newPage}" placeholder="Page #">
                        <button class="confirm-btn" onclick="confirmEdit('\${exhibitLabel}')">✅ Update Link</button>
                        <button class="cancel-btn" onclick="cancelEdit('\${exhibitLabel}')">❌ Cancel</button>
                    \`;
                    
                    console.log('✅ Exhibit ' + exhibitLabel + ' updated to page ' + newPage);
                } else {
                    alert('Error updating exhibit: ' + (data.message || 'Unknown error'));
                    editForm.classList.remove('active');
                }
            })
            .catch(error => {
                console.error('❌ Error updating exhibit:', error);
                alert('Error updating exhibit: ' + error.message);
                editForm.classList.remove('active');
            });
        };
        
        // Handle Enter key in input fields
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && event.target.classList.contains('page-input')) {
                var exhibitLabel = event.target.id.replace('page-input-', '');
                window.confirmEdit(exhibitLabel);
            }
        });
        
        // Test function to verify JavaScript is working
        console.log('🚀 Exhibit edit functionality loaded successfully');
        console.log('📄 Document ID: ' + window.currentDocumentId);
        console.log('📁 Case ID: ' + window.currentCaseId);
        
        // Add click test function for debugging
        window.testEditButton = function() {
            console.log('🧪 Test function called - JavaScript is working!');
            alert('JavaScript is working! Exhibit edit buttons should work now.');
        };
        
        // Test that edit functions are properly loaded
        console.log('📋 Functions available:', {
            editPage: typeof window.editPage,
            confirmEdit: typeof window.confirmEdit,
            cancelEdit: typeof window.cancelEdit,
            testEditButton: typeof window.testEditButton
        });
    </script>
</body>
</html>`;
    }
}