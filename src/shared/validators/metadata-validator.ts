/**
 * Baglib — Type-Aware Metadata Validator
 *
 * Implements validation and sanitization rules tailored to each Work Type:
 * - Books: ISBN-10 (mod 11) and ISBN-13 (mod 10) checksum verification.
 * - Research Papers: DOI syntax validation (10.xxxx/...), year/volume checks.
 * - Lectures & Media: Recording URL validation, duration in minutes non-negative.
 * - Periodicals & Magazines: ISSN checksum verification (xxxx-xxxx).
 * - Universal: Title required, publication year sanity, non-negative price.
 *
 * Provides localized validation messages in both Arabic and English.
 */

import { WorkTypeKey, getWorkTypeInfo } from '../types/metadata';
import type { BookItemInput } from '../types/work';

export interface FieldValidationError {
  field: string;
  messageAr: string;
  messageEn: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: FieldValidationError[];
  warnings: FieldValidationError[];
}

// ============================================================================
// 1. CHECKSUM ALGORITHMS & FORMAT HELPERS
// ============================================================================

/**
 * Validates ISBN-10 checksum using Modulo 11 algorithm.
 */
export function isValidIsbn10(isbn: string): boolean {
  const clean = isbn.replace(/[-\s]/g, '').toUpperCase();
  if (clean.length !== 10) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = parseInt(clean[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * (10 - i);
  }

  const lastChar = clean[9];
  const checkDigit = lastChar === 'X' ? 10 : parseInt(lastChar, 10);
  if (isNaN(checkDigit)) return false;

  sum += checkDigit;
  return sum % 11 === 0;
}

/**
 * Validates ISBN-13 checksum using Modulo 10 algorithm with alternating weights 1 and 3.
 */
export function isValidIsbn13(isbn: string): boolean {
  const clean = isbn.replace(/[-\s]/g, '');
  if (clean.length !== 13) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(clean[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }

  const checkDigit = parseInt(clean[12], 10);
  if (isNaN(checkDigit)) return false;

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return checkDigit === expectedCheckDigit;
}

/**
 * Validates either ISBN-10 or ISBN-13 format & checksum.
 */
export function isValidIsbn(isbn: string): boolean {
  if (!isbn || typeof isbn !== 'string') return false;
  const clean = isbn.replace(/[-\s]/g, '');
  if (clean.length === 10) return isValidIsbn10(clean);
  if (clean.length === 13) return isValidIsbn13(clean);
  return false;
}

/**
 * Validates DOI (Digital Object Identifier) syntax according to the DOI Handbook:
 * Starts with "10." followed by 4 or more digits, a slash, and the registrant suffix.
 */
export function isValidDoi(doi: string): boolean {
  if (!doi || typeof doi !== 'string') return false;
  const clean = doi.trim();
  // Standard DOI regex (handles standard prefix 10.xxxx/...)
  const doiRegex = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/i;
  return doiRegex.test(clean);
}

/**
 * Validates ISSN (International Standard Serial Number) format and Modulo 11 checksum.
 * Standard format: 8 digits separated by hyphen into two groups of 4 (e.g. 2049-3630).
 */
export function isValidIssn(issn: string): boolean {
  if (!issn || typeof issn !== 'string') return false;
  const clean = issn.replace(/[-\s]/g, '').toUpperCase();
  if (clean.length !== 8) return false;

  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const digit = parseInt(clean[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * (8 - i);
  }

  const lastChar = clean[7];
  const checkDigit = lastChar === 'X' ? 10 : parseInt(lastChar, 10);
  if (isNaN(checkDigit)) return false;

  const remainder = sum % 11;
  const expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder;
  return checkDigit === expectedCheckDigit;
}

/**
 * Validates web or media URL format.
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return ['http:', 'https:', 'file:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// ============================================================================
// 2. COMPOSITE TYPE-AWARE METADATA VALIDATOR
// ============================================================================

export function validateWorkMetadata(input: Partial<BookItemInput>): ValidationResult {
  const errors: FieldValidationError[] = [];
  const warnings: FieldValidationError[] = [];

  const workTypeKey: WorkTypeKey = getWorkTypeInfo(input.workTypeId || input.workType).key;

  // --------------------------------------------------------------------------
  // Universal Mandatory Rules
  // --------------------------------------------------------------------------
  if (!input.title || input.title.trim().length === 0) {
    errors.push({
      field: 'title',
      messageAr: 'عنوان العمل مطلوب ولا يمكن تركه فارغاً.',
      messageEn: 'Work title is required and cannot be empty.',
      severity: 'error',
    });
  }

  // Publication Year Sanity Check
  if (input.publicationYear !== undefined && input.publicationYear !== null && input.publicationYear !== '') {
    const yearNum = typeof input.publicationYear === 'number'
      ? input.publicationYear
      : parseInt(String(input.publicationYear).trim(), 10);

    const currentYear = new Date().getFullYear();
    if (isNaN(yearNum)) {
      errors.push({
        field: 'publicationYear',
        messageAr: 'سنة النشر يجب أن تكون قيمة عددية صالحة.',
        messageEn: 'Publication year must be a valid numeric year.',
        severity: 'error',
      });
    } else if (yearNum > currentYear + 2) {
      warnings.push({
        field: 'publicationYear',
        messageAr: `سنة النشر (${yearNum}) في المستقبل البعيد. يرجى التأكد من صحتها.`,
        messageEn: `Publication year (${yearNum}) is in the future. Please verify.`,
        severity: 'warning',
      });
    }
  }

  // Price validation
  if (input.price !== undefined && input.price !== null && input.price !== '') {
    const priceClean = String(input.price).replace(/[^0-9.]/g, '');
    const priceNum = parseFloat(priceClean);
    if (!isNaN(priceNum) && priceNum < 0) {
      errors.push({
        field: 'price',
        messageAr: 'سعر الشراء لا يمكن أن يكون سالباً.',
        messageEn: 'Purchase price cannot be negative.',
        severity: 'error',
      });
    }
  }

  // --------------------------------------------------------------------------
  // Work-Type Specific Validation
  // --------------------------------------------------------------------------
  switch (workTypeKey) {
    case 'book': {
      // ISBN Check
      if (input.isbn && input.isbn.trim().length > 0) {
        if (!isValidIsbn(input.isbn.trim())) {
          errors.push({
            field: 'isbn',
            messageAr: 'الرقم المعياري للكتاب (ISBN) غير صالح أو لم يجتز فحص التدقيق.',
            messageEn: 'ISBN is invalid or failed the checksum verification.',
            severity: 'error',
          });
        }
      }
      break;
    }

    case 'research_paper': {
      // DOI Check
      if (input.doi && input.doi.trim().length > 0) {
        if (!isValidDoi(input.doi.trim())) {
          errors.push({
            field: 'doi',
            messageAr: 'صيغة المعرف الرقمي (DOI) غير صالحة. يجب أن تبدأ بـ 10.xxxx/...',
            messageEn: 'Invalid DOI format. Must start with 10.xxxx/...',
            severity: 'error',
          });
        }
      }

      // Warning if neither journal nor conference is specified
      if (!input.journalName?.trim() && !input.conferenceName?.trim()) {
        warnings.push({
          field: 'journalName',
          messageAr: 'يستحسن تحديد اسم المجلة العلمية أو المؤتمر للورقة البحثية.',
          messageEn: 'Specifying the journal or conference name is recommended for research papers.',
          severity: 'warning',
        });
      }
      break;
    }

    case 'lecture':
    case 'podcast':
    case 'video': {
      // Duration Check
      if (input.durationMinutes !== undefined && input.durationMinutes !== null) {
        const dur = Number(input.durationMinutes);
        if (isNaN(dur) || dur < 0) {
          errors.push({
            field: 'durationMinutes',
            messageAr: 'مدة المحاضرة أو التسجيل بالدقائق يجب أن تكون رقماً موجباً.',
            messageEn: 'Duration in minutes must be a positive number.',
            severity: 'error',
          });
        }
      }

      // Recording URL Check
      if (input.recordingUrl && input.recordingUrl.trim().length > 0) {
        if (!isValidUrl(input.recordingUrl.trim())) {
          errors.push({
            field: 'recordingUrl',
            messageAr: 'رابط التسجيل أو المشاهدة غير صالح. يرجى إدخال رابط يبدأ بـ http:// أو https://',
            messageEn: 'Invalid recording URL. Please provide a valid http:// or https:// link.',
            severity: 'error',
          });
        }
      }
      break;
    }

    case 'periodical': {
      // ISSN Check
      if (input.issn && input.issn.trim().length > 0) {
        if (!isValidIssn(input.issn.trim())) {
          errors.push({
            field: 'issn',
            messageAr: 'الرقم التسلسلي المعياري للدوريات (ISSN) غير صالح (الصيغة الصحيحة: xxxx-xxxx).',
            messageEn: 'Invalid ISSN format or checksum (expected format: xxxx-xxxx).',
            severity: 'error',
          });
        }
      }
      break;
    }

    case 'thesis': {
      // Advisor recommendation
      if (!input.advisor?.trim()) {
        warnings.push({
          field: 'advisor',
          messageAr: 'يستحسن إدخال اسم المشرف العلمي للرسالة أو الأطروحة.',
          messageEn: 'Academic advisor name is recommended for theses/dissertations.',
          severity: 'warning',
        });
      }
      break;
    }

    case 'manuscript': {
      // Holding Institution recommendation
      if (!input.holdingInstitution?.trim() && !input.codexOrShelfmark?.trim()) {
        warnings.push({
          field: 'codexOrShelfmark',
          messageAr: 'يستحسن إدخال مكان الحفظ أو رقم المخطوط (Codex/Shelfmark) لتوثيق المخطوطة.',
          messageEn: 'Holding institution or codex/shelfmark is recommended for historical manuscripts.',
          severity: 'warning',
        });
      }
      break;
    }

    default:
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Checks if a title string is a default placeholder or empty.
 */
export function isPlaceholderTitle(title?: string | null): boolean {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  return (
    t === '' ||
    t === 'مادة جديدة في المكتبة' ||
    t === 'new library material' ||
    t === 'كتاب جديد' ||
    t === 'new book' ||
    t === 'untitled' ||
    t === 'بلا عنوان'
  );
}

/**
 * Checks if an author string is a default placeholder or unknown indicator.
 */
export function isPlaceholderAuthor(author?: string | null): boolean {
  if (!author) return true;
  const a = author.trim().toLowerCase();
  return (
    a === '' ||
    a === 'مؤلف جديد' ||
    a === 'new author' ||
    a === 'مؤلف مجهول' ||
    a === 'unknown author' ||
    a === 'غير معروف' ||
    a === 'unknown' ||
    a === 'مجهول'
  );
}
