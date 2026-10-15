/**
 * OpenXML In-browser Integrity Validator
 * Kiểm định tính toàn vẹn của tệp Excel (.xlsx / OpenXML ECMA-376) ngay trong trình duyệt trước khi tải xuống
 */

export interface ValidationError {
  file: string;
  type: 'SYNTAX_ERROR' | 'SCHEMA_SEQUENCE_ERROR' | 'MISSING_REFERENCE' | 'INCONSISTENT_COUNT';
  message: string;
  detail?: string;
}

export interface ValidationReport {
  isValid: boolean;
  checkedFilesCount: number;
  errors: ValidationError[];
  warnings: string[];
  durationMs: number;
}

/**
 * Phân tích cú pháp chuỗi XML bằng DOMParser tích hợp sẵn trong trình duyệt
 */
export const parseXmlInBrowser = (xmlString: string): { doc: Document | null; error?: string } => {
  try {
    if (typeof DOMParser === 'undefined') {
      return { doc: null };
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    
    // Kiểm tra xem trình duyệt có báo lỗi parsererror hay không
    const parserErrors = doc.getElementsByTagName('parsererror');
    if (parserErrors.length > 0) {
      return {
        doc: null,
        error: parserErrors[0].textContent || 'Lỗi cú pháp XML không xác định'
      };
    }
    return { doc };
  } catch (err: any) {
    return { doc: null, error: err?.message || String(err) };
  }
};

/**
 * Kiểm định toàn diện file nén OpenXML (.xlsx)
 * @param zip Đối tượng JSZip đã nén các thành phần của workbook
 */
export const validateOpenXmlArchive = async (zip: any): Promise<ValidationReport> => {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  let checkedFilesCount = 0;

  // 1. Kiểm tra sự tồn tại của các tệp cốt lõi bắt buộc theo chuẩn OpenXML
  const requiredFiles = ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml'];
  for (const reqFile of requiredFiles) {
    if (!zip.file(reqFile)) {
      errors.push({
        file: reqFile,
        type: 'MISSING_REFERENCE',
        message: `Thiếu tệp cấu trúc bắt buộc: ${reqFile}`
      });
    }
  }

  // Thu thập danh sách tất cả các tệp XML trong gói zip
  const xmlFiles: string[] = [];
  zip.forEach((relativePath: string) => {
    if (relativePath.endsWith('.xml') || relativePath.endsWith('.rels')) {
      xmlFiles.push(relativePath);
    }
  });

  let totalDxfCount = 0;

  // 2. Kiểm tra cú pháp XML (Syntax Parsing) cho từng file
  for (const filePath of xmlFiles) {
    checkedFilesCount++;
    const content = await zip.file(filePath)?.async('string');
    if (!content) {
      errors.push({
        file: filePath,
        type: 'SYNTAX_ERROR',
        message: 'Tệp XML rỗng không có nội dung'
      });
      continue;
    }

    const { doc, error } = parseXmlInBrowser(content);
    if (error) {
      errors.push({
        file: filePath,
        type: 'SYNTAX_ERROR',
        message: `Lỗi cú pháp XML trong tệp ${filePath}`,
        detail: error
      });
      continue;
    }

    // 3. Kiểm định chuyên biệt cho xl/styles.xml (Định dạng kiểu dáng và dxfs)
    if (filePath === 'xl/styles.xml' && doc) {
      const dxfsElements = doc.getElementsByTagName('dxfs');
      if (dxfsElements.length > 1) {
        errors.push({
          file: filePath,
          type: 'SCHEMA_SEQUENCE_ERROR',
          message: 'Trùng lặp thẻ <dxfs> trong styles.xml'
        });
      }

      if (dxfsElements.length === 1) {
        const dxfsEl = dxfsElements[0];
        const countAttr = parseInt(dxfsEl.getAttribute('count') || '0', 10);
        const dxfChildren = dxfsEl.getElementsByTagName('dxf');
        totalDxfCount = dxfChildren.length;

        if (countAttr !== dxfChildren.length) {
          warnings.push(`Thuộc tính count="${countAttr}" trong <dxfs> không khớp với số thẻ <dxf> thực tế (${dxfChildren.length})`);
        }

        // Kiểm tra thứ tự thẻ con trong <dxf> theo quy định ECMA-376 Part 4:
        for (let i = 0; i < dxfChildren.length; i++) {
          const dxf = dxfChildren[i];
          
          // Kiểm tra thứ tự trong <font>: <b> phải đứng trước <color>
          const fontEl = dxf.getElementsByTagName('font')[0];
          if (fontEl) {
            const bEl = fontEl.getElementsByTagName('b')[0];
            const colorEl = fontEl.getElementsByTagName('color')[0];
            if (bEl && colorEl) {
              const pos = bEl.compareDocumentPosition(colorEl);
              // DOCUMENT_POSITION_FOLLOWING = 4 (colorEl phải đứng sau bEl)
              if (!(pos & 4)) {
                errors.push({
                  file: filePath,
                  type: 'SCHEMA_SEQUENCE_ERROR',
                  message: `Thẻ <color> nằm trước thẻ <b/> trong dxf #${i}. Tiêu chuẩn ECMA-376 bắt buộc <b/> phải đứng trước <color>.`
                });
              }
            }
          }

          // Kiểm tra thứ tự trong <border>: left -> right -> top -> bottom
          const borderEl = dxf.getElementsByTagName('border')[0];
          if (borderEl) {
            const leftEl = borderEl.getElementsByTagName('left')[0];
            const topEl = borderEl.getElementsByTagName('top')[0];

            if (topEl && leftEl) {
              const pos = leftEl.compareDocumentPosition(topEl);
              if (!(pos & 4)) {
                errors.push({
                  file: filePath,
                  type: 'SCHEMA_SEQUENCE_ERROR',
                  message: `Thẻ <top> nằm trước thẻ <left> trong border của dxf #${i}. ECMA-376 yêu cầu thứ tự: left, right, top, bottom.`
                });
              }
            }
          }
        }
      }
    }

    // 4. Kiểm định chuyên biệt cho các tệp Worksheet (xl/worksheets/sheet*.xml)
    if (filePath.startsWith('xl/worksheets/sheet') && doc) {
      // Kiểm tra thứ tự bắt buộc của lược đồ Worksheet:
      // conditionalFormatting & dataValidations PHẢI đứng trước pageMargins, ignoredErrors
      const cfEls = doc.getElementsByTagName('conditionalFormatting');
      const dvEls = doc.getElementsByTagName('dataValidations');
      const pageMarginsEls = doc.getElementsByTagName('pageMargins');
      const ignoredErrorsEls = doc.getElementsByTagName('ignoredErrors');

      const boundaryElement = pageMarginsEls[0] || ignoredErrorsEls[0];

      if (boundaryElement) {
        if (cfEls.length > 0) {
          const pos = cfEls[0].compareDocumentPosition(boundaryElement);
          // boundaryElement phải đứng SAU cfEls
          if (!(pos & 4)) {
            errors.push({
              file: filePath,
              type: 'SCHEMA_SEQUENCE_ERROR',
              message: `Thẻ <conditionalFormatting> trong ${filePath} nằm sau thẻ thiết lập trang in/lỗi. Điều này vi phạm lược đồ OpenXML.`
            });
          }
        }

        if (dvEls.length > 0) {
          const pos = dvEls[0].compareDocumentPosition(boundaryElement);
          if (!(pos & 4)) {
            errors.push({
              file: filePath,
              type: 'SCHEMA_SEQUENCE_ERROR',
              message: `Thẻ <dataValidations> trong ${filePath} nằm sau thẻ thiết lập trang in. Điều này vi phạm lược đồ OpenXML.`
            });
          }
        }
      }

      // Kiểm tra tính hợp lệ của dxfId trong các luật conditional formatting
      for (let c = 0; c < cfEls.length; c++) {
        const rules = cfEls[c].getElementsByTagName('cfRule');
        for (let r = 0; r < rules.length; r++) {
          const dxfIdAttr = rules[r].getAttribute('dxfId');
          if (dxfIdAttr !== null) {
            const dxfId = parseInt(dxfIdAttr, 10);
            if (dxfId >= totalDxfCount) {
              errors.push({
                file: filePath,
                type: 'INCONSISTENT_COUNT',
                message: `Quy tắc cfRule tham chiếu dxfId="${dxfId}" nhưng tổng số dxf khai báo trong styles.xml chỉ có ${totalDxfCount}.`
              });
            }
          }
        }
      }
    }

    // 5. Kiểm định xl/workbook.xml
    if (filePath === 'xl/workbook.xml' && doc) {
      const calcPrEls = doc.getElementsByTagName('calcPr');
      const sheetsEls = doc.getElementsByTagName('sheets');
      if (calcPrEls.length > 0 && sheetsEls.length > 0) {
        const pos = sheetsEls[0].compareDocumentPosition(calcPrEls[0]);
        if (!(pos & 4)) {
          errors.push({
            file: filePath,
            type: 'SCHEMA_SEQUENCE_ERROR',
            message: 'Thẻ <calcPr> phải nằm sau thẻ <sheets> trong workbook.xml'
          });
        }
      }
    }
  }

  const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    isValid: errors.length === 0,
    checkedFilesCount,
    errors,
    warnings,
    durationMs: Math.round(endTime - startTime)
  };
};
