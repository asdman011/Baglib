import type { TranslationKey } from '../../translations';

export type ToolOptionValue = string | number | boolean | string[];
export type ToolOptionValues = Record<string, ToolOptionValue>;
export type ToolOptionKind = 'pages' | 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'color' | 'password' | 'file' | 'files';

export interface ToolOption {
  name: string;
  kind: ToolOptionKind;
  label: TranslationKey;
  value?: ToolOptionValue;
  hint?: TranslationKey;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** File types offered by the picker of a file option. */
  extensions?: string[];
  choices?: { value: string | number; label: TranslationKey }[];
  /** Shown only while another option holds one of these values. */
  when?: { name: string; is: ToolOptionValue[] };
  /** Steers the form only; `toolParameters` turns it into engine fields where needed. */
  local?: boolean;
  /** A filled value must match, because the engine silently discards malformed ones. */
  format?: { pattern: RegExp; message: TranslationKey };
  /** A filled value must differ from this option's value, as Acrobat requires of the two passwords. */
  differsFrom?: { name: string; message: TranslationKey };
}

/** Additional documents travel with the main file as input files, not as a form field. */
export const ADDITIONAL_FILES = 'additionalFiles';

const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'];
const PDF_TYPES = ['pdf'];

const pages = (required = false, value: string | undefined = required ? undefined : 'all', label: TranslationKey = 'stirlingOptPages'): ToolOption => ({
  name: 'pageNumbers', kind: 'pages', label, value, required, hint: 'stirlingOptPagesHint',
});
const number = (name: string, label: TranslationKey, value: number, min?: number, max?: number, step?: number): ToolOption => ({ name, kind: 'number', label, value, min, max, step });
const toggle = (name: string, label: TranslationKey, value = false, hint?: TranslationKey): ToolOption => ({ name, kind: 'toggle', label, value, hint });
const select = (name: string, label: TranslationKey, value: string | number, choices: ToolOption['choices']): ToolOption => ({ name, kind: 'select', label, value, choices });
const withWhen = (option: ToolOption, name: string, ...is: ToolOptionValue[]): ToolOption => ({ ...option, when: { name, is } });

const POSITIONS: ToolOption['choices'] = [
  { value: 1, label: 'stirlingOptTopLeft' }, { value: 2, label: 'stirlingOptTopCenter' }, { value: 3, label: 'stirlingOptTopRight' },
  { value: 4, label: 'stirlingOptMiddleLeft' }, { value: 5, label: 'stirlingOptCenter' }, { value: 6, label: 'stirlingOptMiddleRight' },
  { value: 7, label: 'stirlingOptBottomLeft' }, { value: 8, label: 'stirlingOptBottomCenter' }, { value: 9, label: 'stirlingOptBottomRight' },
];
const MARGINS: ToolOption['choices'] = [
  { value: 'small', label: 'stirlingOptSmall' }, { value: 'medium', label: 'stirlingOptMedium' },
  { value: 'large', label: 'stirlingOptLarge' }, { value: 'x-large', label: 'stirlingOptExtraLarge' },
];
const COLOR_TYPES: ToolOption['choices'] = [
  { value: 'color', label: 'stirlingOptColor' }, { value: 'greyscale', label: 'stirlingOptGreyscale' }, { value: 'blackwhite', label: 'stirlingOptBlackWhite' },
];
const ORIENTATIONS: ToolOption['choices'] = [{ value: 'PORTRAIT', label: 'stirlingOptPortrait' }, { value: 'LANDSCAPE', label: 'stirlingOptLandscape' }];
const COMPARATORS: ToolOption['choices'] = [{ value: 'Greater', label: 'stirlingOptGreater' }, { value: 'Equal', label: 'stirlingOptEqual' }, { value: 'Less', label: 'stirlingOptLess' }];
const PAGE_SIZES = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'LETTER', 'LEGAL'].map(value => ({ value, label: `stirlingOptSize${value}` as TranslationKey }));

const PERMISSIONS: ToolOption[] = [
  toggle('preventPrinting', 'stirlingOptPreventPrinting'), toggle('preventPrintingFaithful', 'stirlingOptPreventHighResPrinting'),
  toggle('preventModify', 'stirlingOptPreventModify'), toggle('preventAssembly', 'stirlingOptPreventAssembly'),
  toggle('preventExtractContent', 'stirlingOptPreventCopy'), toggle('preventExtractForAccessibility', 'stirlingOptPreventAccessibility'),
  toggle('preventFillInForm', 'stirlingOptPreventForms'), toggle('preventModifyAnnotations', 'stirlingOptPreventComments'),
];
const KEY_LENGTH = select('keyLength', 'stirlingOptKeyLength', 256, [{ value: 256, label: 'stirlingOptKey256' }, { value: 128, label: 'stirlingOptKey128' }]);
const REPLACE_COLORS: ToolOption[] = [
  select('replaceAndInvertOption', 'stirlingOptColorMode', 'HIGH_CONTRAST_COLOR', [
    { value: 'HIGH_CONTRAST_COLOR', label: 'stirlingOptHighContrast' }, { value: 'CUSTOM_COLOR', label: 'stirlingOptCustomColors' },
    { value: 'FULL_INVERSION', label: 'stirlingOptFullInversion' }, { value: 'COLOR_SPACE_CONVERSION', label: 'stirlingOptToGreyscaleColors' },
  ]),
  withWhen(select('highContrastColorCombination', 'stirlingOptContrastScheme', 'WHITE_TEXT_ON_BLACK', [
    { value: 'WHITE_TEXT_ON_BLACK', label: 'stirlingOptWhiteOnBlack' }, { value: 'BLACK_TEXT_ON_WHITE', label: 'stirlingOptBlackOnWhite' },
    { value: 'YELLOW_TEXT_ON_BLACK', label: 'stirlingOptYellowOnBlack' }, { value: 'GREEN_TEXT_ON_BLACK', label: 'stirlingOptGreenOnBlack' },
  ]), 'replaceAndInvertOption', 'HIGH_CONTRAST_COLOR'),
  withWhen({ name: 'backGroundColor', kind: 'color', label: 'stirlingOptBackgroundColor', value: '#ffffff' }, 'replaceAndInvertOption', 'CUSTOM_COLOR'),
  withWhen({ name: 'textColor', kind: 'color', label: 'stirlingOptTextColor', value: '#000000' }, 'replaceAndInvertOption', 'CUSTOM_COLOR'),
];
const DIGIT = '[\\d\u0660-\u0669]';
/** Search presets modelled on Acrobat's Search & Redact patterns, extended to Arabic digits and letters. */
const REDACT_PATTERNS: Record<string, string> = {
  email: '[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}-]+(\\.[\\p{L}\\p{N}-]+)+',
  phone: `(?<!\\p{N})\\+?${DIGIT}[\\d\u0660-\u0669 ().-]{7,}${DIGIT}(?!\\p{N})`,
  card: `(?<!\\p{N})${DIGIT}{4}[ -]?${DIGIT}{4}[ -]?${DIGIT}{4}[ -]?${DIGIT}{1,4}(?!\\p{N})`,
  date: `(?<!\\p{N})(${DIGIT}{1,2}[/.-]${DIGIT}{1,2}[/.-]${DIGIT}{2,4}|${DIGIT}{4}[/.-]${DIGIT}{1,2}[/.-]${DIGIT}{1,2})(?!\\p{N})`,
};
const METADATA_DATE = { pattern: /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/u, message: 'stirlingOptDateInvalid' as TranslationKey };
const OUTPUT_FORMAT = (value: string, choices: ToolOption['choices']) => select('outputFormat', 'stirlingOptOutputFormat', value, choices);
const CARD_TEXT_STYLE = (size: number, opacity: number, rotation: number): ToolOption[] => [
  number('fontSize', 'stirlingOptFontSize', size, 4, 400),
  number('rotation', 'stirlingOptRotation', rotation, -360, 360),
  number('opacity', 'stirlingOptOpacity', opacity, 0, 1, 0.05),
  { name: 'customColor', kind: 'color', label: 'stirlingOptTextColor', value: '#d3d3d3' },
];

/**
 * What each Hub tool asks before it runs. Names, values and defaults come from the v3.2.2 engine's API
 * document and were run against it; the API text is wrong in places, so behaviour was checked on output.
 * Tools absent here take no options: the engine declares none.
 */
export const STIRLING_TOOL_OPTIONS: Record<string, ToolOption[]> = {
  'scale-pages': [
    select('pageSize', 'stirlingOptPageSize', 'KEEP', [{ value: 'KEEP', label: 'stirlingOptKeepSize' }, ...PAGE_SIZES]),
    select('orientation', 'stirlingOptOrientation', 'PORTRAIT', ORIENTATIONS),
    number('scaleFactor', 'stirlingOptScaleFactor', 1, 0.1, 10, 0.05),
  ],
  crop: [
    toggle('autoCrop', 'stirlingOptAutoCrop', true, 'stirlingOptAutoCropHint'),
    withWhen(number('x', 'stirlingOptX', 0, 0), 'autoCrop', false),
    withWhen(number('y', 'stirlingOptY', 0, 0), 'autoCrop', false),
    withWhen(number('width', 'stirlingOptWidth', 595, 1), 'autoCrop', false),
    withWhen(number('height', 'stirlingOptHeight', 842, 1), 'autoCrop', false),
    pages(),
    toggle('removeDataOutsideCrop', 'stirlingOptRemoveOutsideCrop', false, 'stirlingOptRemoveOutsideCropHint'),
  ],
  'extract-pages': [pages(true, undefined, 'stirlingOptPagesToExtract')],
  merge: [
    { name: ADDITIONAL_FILES, kind: 'files', label: 'stirlingOptFilesToMerge', required: true, extensions: PDF_TYPES },
    select('sortType', 'stirlingOptSortFiles', 'orderProvided', [
      { value: 'orderProvided', label: 'stirlingOptOrderChosen' }, { value: 'byFileName', label: 'stirlingOptByFileName' },
      { value: 'byDateModified', label: 'stirlingOptByDateModified' }, { value: 'byDateCreated', label: 'stirlingOptByDateCreated' }, { value: 'byPDFTitle', label: 'stirlingOptByTitle' },
    ]),
    toggle('generateToc', 'stirlingOptGenerateToc', true, 'stirlingOptGenerateTocHint'),
    toggle('removeCertSign', 'stirlingOptRemoveSignatures', true),
  ],
  'multi-page-layout': [
    select('mode', 'stirlingOptLayoutMode', 'DEFAULT', [{ value: 'DEFAULT', label: 'stirlingOptLayoutPreset' }, { value: 'CUSTOM', label: 'stirlingOptLayoutCustom' }]),
    withWhen(select('pagesPerSheet', 'stirlingOptPagesPerSheet', 2, [2, 4, 9, 16].map(value => ({ value, label: `stirlingOptPerSheet${value}` as TranslationKey }))), 'mode', 'DEFAULT'),
    withWhen(number('rows', 'stirlingOptRows', 1, 1, 10), 'mode', 'CUSTOM'),
    withWhen(number('cols', 'stirlingOptColumns', 2, 1, 10), 'mode', 'CUSTOM'),
    select('arrangement', 'stirlingOptArrangement', 'BY_ROWS', [{ value: 'BY_ROWS', label: 'stirlingOptByRows' }, { value: 'BY_COLUMNS', label: 'stirlingOptByColumns' }]),
    select('readingDirection', 'stirlingOptReadingDirection', 'LTR', [{ value: 'LTR', label: 'stirlingOptLeftToRight' }, { value: 'RTL', label: 'stirlingOptRightToLeft' }]),
    select('orientation', 'stirlingOptOrientation', 'PORTRAIT', ORIENTATIONS),
    number('innerMargin', 'stirlingOptInnerMargin', 0, 0, 200),
    number('topMargin', 'stirlingOptMarginTop', 0, 0, 200), number('bottomMargin', 'stirlingOptMarginBottom', 0, 0, 200),
    number('leftMargin', 'stirlingOptMarginLeft', 0, 0, 200), number('rightMargin', 'stirlingOptMarginRight', 0, 0, 200),
    toggle('addBorder', 'stirlingOptAddBorder'),
    withWhen(number('borderWidth', 'stirlingOptBorderWidth', 1, 1, 20), 'addBorder', true),
  ],
  reorder: [
    select('customMode', 'stirlingOptPageOrder', 'CUSTOM', [
      { value: 'CUSTOM', label: 'stirlingOptOrderCustom' }, { value: 'REVERSE_ORDER', label: 'stirlingOptOrderReverse' }, { value: 'DUPLEX_SORT', label: 'stirlingOptOrderDuplex' },
      { value: 'BOOKLET_SORT', label: 'stirlingOptOrderBooklet' }, { value: 'SIDE_STITCH_BOOKLET_SORT', label: 'stirlingOptOrderSideStitch' },
      { value: 'ODD_EVEN_SPLIT', label: 'stirlingOptOrderOddEven' }, { value: 'REMOVE_FIRST', label: 'stirlingOptOrderRemoveFirst' },
      { value: 'REMOVE_LAST', label: 'stirlingOptOrderRemoveLast' }, { value: 'REMOVE_FIRST_AND_LAST', label: 'stirlingOptOrderRemoveBoth' },
      { value: 'DUPLICATE', label: 'stirlingOptOrderDuplicate' },
    ]),
    withWhen({ ...pages(true, undefined, 'stirlingOptNewPageOrder') }, 'customMode', 'CUSTOM'),
    withWhen(number('pageNumbers', 'stirlingOptCopiesPerPage', 2, 2, 50), 'customMode', 'DUPLICATE'),
  ],
  'remove-pages': [pages(true, undefined, 'stirlingOptPagesToRemove')],
  rotate: [select('angle', 'stirlingOptAngle', 90, [{ value: 90, label: 'stirlingOptAngle90' }, { value: 180, label: 'stirlingOptAngle180' }, { value: 270, label: 'stirlingOptAngle270' }])],
  split: [pages(true, undefined, 'stirlingOptSplitAfter')],
  'html-to-pdf': [number('zoom', 'stirlingOptZoom', 1, 0.1, 5, 0.1)],
  'eml-to-pdf': [
    toggle('includeAllRecipients', 'stirlingOptAllRecipients', true),
    toggle('includeAttachments', 'stirlingOptIncludeAttachments'),
    withWhen(number('maxAttachmentSizeMB', 'stirlingOptMaxAttachmentMb', 10, 1, 100), 'includeAttachments', true),
  ],
  'img-to-pdf': [
    { name: ADDITIONAL_FILES, kind: 'files', label: 'stirlingOptMoreImages', extensions: IMAGE_TYPES },
    select('fitOption', 'stirlingOptImageFit', 'fillPage', [
      { value: 'fillPage', label: 'stirlingOptFillPage' }, { value: 'fitDocumentToImage', label: 'stirlingOptFitToImage' },
      { value: 'fitDocumentToPage', label: 'stirlingOptFitToPage' }, { value: 'maintainAspectRatio', label: 'stirlingOptKeepAspect' },
    ]),
    select('colorType', 'stirlingOptColorType', 'color', COLOR_TYPES),
    toggle('autoRotate', 'stirlingOptAutoRotate'),
  ],
  'url-to-pdf': [{ name: 'urlInput', kind: 'text', label: 'stirlingOptUrl', required: true }],
  'pdf-to-word': [OUTPUT_FORMAT('docx', [{ value: 'docx', label: 'stirlingOptFormatDocx' }, { value: 'odt', label: 'stirlingOptFormatOdt' }])],
  'pdf-to-presentation': [OUTPUT_FORMAT('pptx', [{ value: 'pptx', label: 'stirlingOptFormatPptx' }, { value: 'ppt', label: 'stirlingOptFormatPpt' }, { value: 'odp', label: 'stirlingOptFormatOdp' }])],
  'pdf-to-rtf': [OUTPUT_FORMAT('rtf', [{ value: 'rtf', label: 'stirlingOptFormatRtf' }, { value: 'txt', label: 'stirlingOptFormatTxt' }])],
  'pdf-to-csv': [pages()],
  'pdf-to-img': [
    pages(),
    select('imageFormat', 'stirlingOptImageFormat', 'png', [{ value: 'png', label: 'stirlingOptPng' }, { value: 'jpeg', label: 'stirlingOptJpeg' }, { value: 'gif', label: 'stirlingOptGif' }]),
    select('singleOrMultiple', 'stirlingOptImageOutput', 'multiple', [{ value: 'multiple', label: 'stirlingOptOneImagePerPage' }, { value: 'single', label: 'stirlingOptOneLongImage' }]),
    select('colorType', 'stirlingOptColorType', 'color', COLOR_TYPES),
    number('dpi', 'stirlingOptDpi', 150, 36, 600),
    toggle('includeAnnotations', 'stirlingOptIncludeAnnotations'),
  ],
  'add-password': [
    { name: 'password', kind: 'password', label: 'stirlingOptOpenPassword', hint: 'stirlingOptOpenPasswordHint', required: true },
    { name: 'ownerPassword', kind: 'password', label: 'stirlingOptOwnerPassword', hint: 'stirlingOptOwnerPasswordHint', differsFrom: { name: 'password', message: 'stirlingOptPasswordsMustDiffer' } },
    { name: 'sourcePassword', kind: 'password', label: 'stirlingOptSourcePassword', hint: 'stirlingOptSourcePasswordHint' },
    KEY_LENGTH, ...PERMISSIONS,
  ],
  'change-permissions': [
    toggle('preserveExisting', 'stirlingOptKeepPasswords', false, 'stirlingOptKeepPasswordsHint'),
    withWhen({ name: 'sourcePassword', kind: 'password', label: 'stirlingOptSourcePermissionsPassword', required: true }, 'preserveExisting', true),
    withWhen({ name: 'password', kind: 'password', label: 'stirlingOptOpenPassword', hint: 'stirlingOptKeepOpenHint' }, 'preserveExisting', true),
    withWhen({ name: 'sourcePassword', kind: 'password', label: 'stirlingOptSourcePassword', hint: 'stirlingOptSourcePasswordHint' }, 'preserveExisting', false),
    withWhen({ name: 'ownerPassword', kind: 'password', label: 'stirlingOptOwnerPassword', hint: 'stirlingOptOwnerPasswordHint', required: true }, 'preserveExisting', false),
    withWhen({ name: 'ownerPassword', kind: 'password', label: 'stirlingOptNewOwnerPassword', hint: 'stirlingOptOwnerPasswordKeepHint' }, 'preserveExisting', true),
    KEY_LENGTH, ...PERMISSIONS,
  ],
  'add-stamp': [
    select('stampType', 'stirlingOptStampType', 'text', [{ value: 'text', label: 'stirlingOptTypeText' }, { value: 'image', label: 'stirlingOptTypeImage' }, { value: 'qr', label: 'stirlingOptTypeQr' }]),
    withWhen({ name: 'stampText', kind: 'text', label: 'stirlingOptStampText', required: true }, 'stampType', 'text'),
    withWhen({ name: 'stampText', kind: 'text', label: 'stirlingOptQrContent', hint: 'stirlingOptQrContentHint', required: true }, 'stampType', 'qr'),
    withWhen({ name: 'stampImage', kind: 'file', label: 'stirlingOptStampImage', required: true, extensions: IMAGE_TYPES }, 'stampType', 'image'),
    pages(),
    { ...toggle('customPlacement', 'stirlingOptCustomPlacement', false, 'stirlingOptCustomPlacementHint'), local: true },
    withWhen(select('position', 'stirlingOptPosition', 8, POSITIONS), 'customPlacement', false),
    withWhen(select('customMargin', 'stirlingOptMargin', 'medium', MARGINS), 'customPlacement', false),
    withWhen(number('overrideX', 'stirlingOptFromLeft', 36, 0), 'customPlacement', true),
    withWhen(number('overrideY', 'stirlingOptFromBottom', 36, 0), 'customPlacement', true),
    withWhen(number('fontSize', 'stirlingOptQrSize', 80, 20, 400), 'stampType', 'qr'),
    ...CARD_TEXT_STYLE(40, 0.5, 0).map(option => withWhen(option, 'stampType', ...(option.name === 'opacity' || option.name === 'rotation' ? ['text', 'image', 'qr'] : ['text']))),
  ],
  watermark: [
    select('watermarkType', 'stirlingOptWatermarkType', 'text', [{ value: 'text', label: 'stirlingOptTypeText' }, { value: 'image', label: 'stirlingOptTypeImage' }]),
    withWhen({ name: 'watermarkText', kind: 'text', label: 'stirlingOptWatermarkText', required: true }, 'watermarkType', 'text'),
    withWhen({ name: 'watermarkImage', kind: 'file', label: 'stirlingOptWatermarkImage', required: true, extensions: IMAGE_TYPES }, 'watermarkType', 'image'),
    ...CARD_TEXT_STYLE(30, 0.25, 45).map(option => withWhen(option, 'watermarkType', ...(option.name === 'opacity' || option.name === 'rotation' ? ['text', 'image'] : ['text']))),
    number('widthSpacer', 'stirlingOptHorizontalSpacing', 50, 0, 1000),
    number('heightSpacer', 'stirlingOptVerticalSpacing', 50, 0, 1000),
    toggle('convertPDFToImage', 'stirlingOptFlattenToImages', false, 'stirlingOptFlattenToImagesHint'),
  ],
  'auto-redact': [
    { ...select('redactPattern', 'stirlingOptRedactSearch', 'custom', [
      { value: 'custom', label: 'stirlingOptRedactCustom' }, { value: 'email', label: 'stirlingOptRedactEmail' }, { value: 'phone', label: 'stirlingOptRedactPhone' },
      { value: 'card', label: 'stirlingOptRedactCard' }, { value: 'date', label: 'stirlingOptRedactDate' },
    ]), local: true },
    withWhen({ name: 'listOfText', kind: 'textarea', label: 'stirlingOptTextToRedact', hint: 'stirlingOptTextToRedactHint', required: true }, 'redactPattern', 'custom'),
    withWhen(toggle('useRegex', 'stirlingOptUseRegex'), 'redactPattern', 'custom'),
    withWhen(toggle('wholeWordSearch', 'stirlingOptWholeWord', false, 'stirlingOptWholeWordHint'), 'redactPattern', 'custom'),
    withWhen(toggle('caseSensitive', 'stirlingOptCaseSensitive'), 'redactPattern', 'custom'),
    { name: 'redactColor', kind: 'color', label: 'stirlingOptRedactColor', value: '#000000' },
    number('customPadding', 'stirlingOptPadding', 0.1, 0, 10, 0.1),
    toggle('convertPDFToImage', 'stirlingOptRasterizeRedaction', true, 'stirlingOptRasterizeAutoHint'),
  ],
  'remove-password': [
    { ...select('removeMode', 'stirlingOptRemovePasswordMode', 'all', [
      { value: 'all', label: 'stirlingOptRemoveAllPasswords' }, { value: 'open', label: 'stirlingOptRemoveOpenPassword' }, { value: 'permissions', label: 'stirlingOptRemovePermissionsPassword' },
    ]), local: true },
    withWhen({ name: 'password', kind: 'password', label: 'stirlingOptCurrentPassword', hint: 'stirlingOptRemoveAllHint', required: true }, 'removeMode', 'all'),
    withWhen({ name: 'password', kind: 'password', label: 'stirlingOptOpenPassword', hint: 'stirlingOptRemoveOpenHint', required: true }, 'removeMode', 'open'),
    withWhen({ name: 'ownerPassword', kind: 'password', label: 'stirlingOptOwnerPassword', required: true }, 'removeMode', 'permissions'),
    withWhen({ name: 'retainedOpeningPassword', kind: 'password', label: 'stirlingOptOpenPassword', hint: 'stirlingOptRetainOpenHint' }, 'removeMode', 'permissions'),
  ],
  'sanitize-pdf': [
    toggle('removeJavaScript', 'stirlingOptRemoveJavaScript', true), toggle('removeEmbeddedFiles', 'stirlingOptRemoveEmbeddedFiles', true),
    toggle('removeXMPMetadata', 'stirlingOptRemoveXmp'), toggle('removeMetadata', 'stirlingOptRemoveMetadata'),
    toggle('removeLinks', 'stirlingOptRemoveLinks'), toggle('removeFonts', 'stirlingOptRemoveFonts', false, 'stirlingOptRemoveFontsHint'),
  ],
  'cert-sign': [
    select('certType', 'stirlingOptCertType', 'PKCS12', [{ value: 'PKCS12', label: 'stirlingOptCertPkcs12' }, { value: 'PEM', label: 'stirlingOptCertPem' }, { value: 'JKS', label: 'stirlingOptCertJks' }]),
    withWhen({ name: 'p12File', kind: 'file', label: 'stirlingOptCertFile', required: true, extensions: ['p12', 'pfx'] }, 'certType', 'PKCS12'),
    withWhen({ name: 'jksFile', kind: 'file', label: 'stirlingOptCertFile', required: true, extensions: ['jks'] }, 'certType', 'JKS'),
    withWhen({ name: 'certFile', kind: 'file', label: 'stirlingOptCertFile', required: true, extensions: ['pem', 'crt', 'cer'] }, 'certType', 'PEM'),
    withWhen({ name: 'privateKeyFile', kind: 'file', label: 'stirlingOptPrivateKey', hint: 'stirlingOptPrivateKeyHint', required: true, extensions: ['pem', 'key', 'der'] }, 'certType', 'PEM'),
    { name: 'password', kind: 'password', label: 'stirlingOptCertPassword' },
    toggle('showSignature', 'stirlingOptShowSignature'),
    withWhen({ name: 'reason', kind: 'text', label: 'stirlingOptSignReason' }, 'showSignature', true),
    withWhen({ name: 'location', kind: 'text', label: 'stirlingOptSignLocation' }, 'showSignature', true),
    withWhen({ name: 'name', kind: 'text', label: 'stirlingOptSignName' }, 'showSignature', true),
    withWhen(number('pageNumber', 'stirlingOptSignPage', 1, 1), 'showSignature', true),
    withWhen(toggle('showLogo', 'stirlingOptShowLogo'), 'showSignature', true),
  ],
  'validate-signature': [{ name: 'certFile', kind: 'file', label: 'stirlingOptTrustedCert', extensions: ['pem', 'crt', 'cer'] }],
  'add-image': [
    { name: 'imageFile', kind: 'file', label: 'stirlingOptImageFile', required: true, extensions: IMAGE_TYPES },
    number('x', 'stirlingOptX', 36, 0), number('y', 'stirlingOptY', 36, 0),
    toggle('everyPage', 'stirlingOptEveryPage'),
  ],
  'add-page-numbers': [
    { ...pages(false, 'all', 'stirlingOptPagesToNumber'), name: 'pagesToNumber' },
    select('position', 'stirlingOptPosition', 8, POSITIONS),
    number('startingNumber', 'stirlingOptStartAt', 1, 0),
    { name: 'customText', kind: 'text', label: 'stirlingOptNumberFormat', hint: 'stirlingOptNumberFormatHint', value: '{n}' },
    number('zeroPad', 'stirlingOptZeroPad', 0, 0, 8),
    select('customMargin', 'stirlingOptMargin', 'medium', MARGINS),
    number('fontSize', 'stirlingOptFontSize', 12, 4, 96),
    select('fontType', 'stirlingOptFont', 'helvetica', [{ value: 'helvetica', label: 'stirlingOptFontHelvetica' }, { value: 'times', label: 'stirlingOptFontTimes' }, { value: 'courier', label: 'stirlingOptFontCourier' }]),
    { name: 'fontColor', kind: 'color', label: 'stirlingOptTextColor', value: '#000000' },
  ],
  'adjust-colors': REPLACE_COLORS,
  'adjust-contrast': REPLACE_COLORS,
  'edit-metadata': [
    { name: 'title', kind: 'text', label: 'stirlingOptMetaTitle', hint: 'stirlingOptMetadataHint' },
    { name: 'author', kind: 'text', label: 'stirlingOptMetaAuthor' }, { name: 'subject', kind: 'text', label: 'stirlingOptMetaSubject' },
    { name: 'keywords', kind: 'text', label: 'stirlingOptMetaKeywords' }, { name: 'creator', kind: 'text', label: 'stirlingOptMetaCreator' },
    { name: 'producer', kind: 'text', label: 'stirlingOptMetaProducer' },
    { name: 'creationDate', kind: 'text', label: 'stirlingOptMetaCreated', hint: 'stirlingOptMetaDateHint', format: METADATA_DATE },
    { name: 'modificationDate', kind: 'text', label: 'stirlingOptMetaModified', hint: 'stirlingOptMetaDateHint', format: METADATA_DATE },
    select('trapped', 'stirlingOptMetaTrapped', '', [{ value: '', label: 'stirlingOptNotSet' }, { value: 'True', label: 'stirlingOptYes' }, { value: 'False', label: 'stirlingOptNo' }, { value: 'Unknown', label: 'stirlingOptUnknown' }]),
    toggle('deleteAll', 'stirlingOptDeleteAllMetadata'),
  ],
  'extract-images': [select('format', 'stirlingOptImageFormat', 'png', [{ value: 'png', label: 'stirlingOptPng' }, { value: 'jpeg', label: 'stirlingOptJpeg' }, { value: 'gif', label: 'stirlingOptGif' }])],
  'flatten-forms': [toggle('flattenOnlyForms', 'stirlingOptFlattenFormsOnly', true, 'stirlingOptFlattenFormsOnlyHint'), withWhen(number('renderDpi', 'stirlingOptDpi', 200, 72, 600), 'flattenOnlyForms', false)],
  'ocr-pdf': [
    select('languages', 'stirlingOptOcrLanguages', 'ara,eng', [{ value: 'ara,eng', label: 'stirlingOptOcrArabicEnglish' }, { value: 'ara', label: 'stirlingOptOcrArabic' }, { value: 'eng', label: 'stirlingOptOcrEnglish' }]),
    select('ocrType', 'stirlingOptOcrMode', 'skip-text', [{ value: 'skip-text', label: 'stirlingOptOcrSkipText' }, { value: 'force-ocr', label: 'stirlingOptOcrForce' }, { value: 'Normal', label: 'stirlingOptOcrNormal' }]),
    select('ocrRenderType', 'stirlingOptOcrLayer', 'hocr', [{ value: 'hocr', label: 'stirlingOptOcrHocr' }, { value: 'sandwich', label: 'stirlingOptOcrSandwich' }]),
    toggle('deskew', 'stirlingOptDeskew'), toggle('rotatePages', 'stirlingOptRotatePages'), toggle('clean', 'stirlingOptCleanScan'),
    toggle('cleanFinal', 'stirlingOptCleanFinal'), toggle('sidecar', 'stirlingOptOcrSidecar'), toggle('removeImagesAfter', 'stirlingOptOcrRemoveImages'),
  ],
  'remove-blanks': [number('threshold', 'stirlingOptBlankThreshold', 10, 0, 255), number('whitePercent', 'stirlingOptWhitePercent', 99.9, 0, 100, 0.1)],
  'auto-rename': [toggle('useFirstTextAsFallback', 'stirlingOptUseFirstText')],
  'split-by-size': [
    select('splitType', 'stirlingOptSplitBy', 0, [{ value: 0, label: 'stirlingOptSplitBySize' }, { value: 1, label: 'stirlingOptSplitByPages' }, { value: 2, label: 'stirlingOptSplitByDocuments' }]),
    withWhen({ name: 'splitValue', kind: 'text', label: 'stirlingOptMaxFileSize', value: '10MB', required: true }, 'splitType', 0),
    withWhen({ name: 'splitValue', kind: 'text', label: 'stirlingOptPagesPerFile', value: '10', required: true }, 'splitType', 1),
    withWhen({ name: 'splitValue', kind: 'text', label: 'stirlingOptDocumentCount', value: '2', required: true }, 'splitType', 2),
  ],
  'auto-split': [toggle('duplexMode', 'stirlingOptDuplexScan')],
  'compress-pdf': [
    { ...select('compressGoal', 'stirlingOptCompressGoal', 'level', [{ value: 'level', label: 'stirlingOptCompressByLevel' }, { value: 'size', label: 'stirlingOptCompressToSize' }]), local: true },
    withWhen({ ...select('optimizeLevel', 'stirlingOptCompressionLevel', 4, [
      { value: 1, label: 'stirlingOptCompressLossless' }, { value: 2, label: 'stirlingOptCompressLight' }, { value: 4, label: 'stirlingOptCompressBalanced' },
      { value: 6, label: 'stirlingOptCompressStrong' }, { value: 9, label: 'stirlingOptCompressMaximum' },
    ]), hint: 'stirlingOptCompressionLevelHint' }, 'compressGoal', 'level'),
    withWhen({ name: 'expectedOutputSize', kind: 'text', label: 'stirlingOptTargetSize', hint: 'stirlingOptTargetSizeHint', required: true, format: { pattern: /^\d+(\.\d+)?\s*(KB|MB|GB)$/iu, message: 'stirlingOptTargetSizeInvalid' } }, 'compressGoal', 'size'),
    toggle('grayscale', 'stirlingOptGrayscale'), toggle('linearize', 'stirlingOptLinearize', false, 'stirlingOptLinearizeHint'), toggle('normalize', 'stirlingOptNormalize'),
    toggle('lineArt', 'stirlingOptLineArt', false, 'stirlingOptLineArtHint'),
    withWhen(number('lineArtThreshold', 'stirlingOptLineArtThreshold', 55, 0, 100), 'lineArt', true),
    withWhen(select('lineArtEdgeLevel', 'stirlingOptLineArtEdge', 1, [{ value: 1, label: 'stirlingOptEdgeLight' }, { value: 2, label: 'stirlingOptEdgeMedium' }, { value: 3, label: 'stirlingOptEdgeStrong' }]), 'lineArt', true),
  ],
  'remove-annotations': [
    toggle('keepLinks', 'stirlingOptKeepLinks', true, 'stirlingOptKeepLinksHint'),
    toggle('keepFormFields', 'stirlingOptKeepFormFields', true, 'stirlingOptKeepFormFieldsHint'),
  ],
  'overlay-pdfs': [
    { name: 'overlayFiles', kind: 'files', label: 'stirlingOptOverlayFiles', required: true, extensions: PDF_TYPES },
    select('overlayMode', 'stirlingOptOverlayMode', 'SequentialOverlay', [
      { value: 'SequentialOverlay', label: 'stirlingOptOverlaySequential' }, { value: 'InterleavedOverlay', label: 'stirlingOptOverlayInterleaved' }, { value: 'FixedRepeatOverlay', label: 'stirlingOptOverlayRepeat' },
    ]),
    withWhen({ name: 'counts', kind: 'text', label: 'stirlingOptOverlayCounts', hint: 'stirlingOptOverlayCountsHint', required: true }, 'overlayMode', 'FixedRepeatOverlay'),
    select('overlayPosition', 'stirlingOptOverlayPosition', 0, [{ value: 0, label: 'stirlingOptOverlayForeground' }, { value: 1, label: 'stirlingOptOverlayBackground' }]),
  ],
  'split-by-chapters': [
    number('bookmarkLevel', 'stirlingOptBookmarkLevel', 0, 0, 10), toggle('includeMetadata', 'stirlingOptIncludeMetadata', true), toggle('allowDuplicates', 'stirlingOptAllowDuplicates'),
  ],
  'filter-contains-text': [{ name: 'text', kind: 'text', label: 'stirlingOptTextToFind', required: true }, pages()],
  'filter-contains-image': [pages()],
  'filter-page-count': [select('comparator', 'stirlingOptComparator', 'Greater', COMPARATORS), number('pageCount', 'stirlingOptPageCount', 1, 0)],
  'filter-page-size': [select('comparator', 'stirlingOptComparator', 'Equal', COMPARATORS), select('standardPageSize', 'stirlingOptPageSize', 'A4', PAGE_SIZES)],
  'filter-file-size': [select('comparator', 'stirlingOptComparator', 'Greater', COMPARATORS), number('fileSize', 'stirlingOptFileSizeBytes', 1048576, 0)],
  'filter-page-rotation': [select('comparator', 'stirlingOptComparator', 'Equal', COMPARATORS), select('rotation', 'stirlingOptAngle', 0, [{ value: 0, label: 'stirlingOptAngle0' }, { value: 90, label: 'stirlingOptAngle90' }, { value: 180, label: 'stirlingOptAngle180' }, { value: 270, label: 'stirlingOptAngle270' }])],
};

/** Tools that start from typed input rather than a chosen document. */
export const TOOLS_WITHOUT_INPUT_FILE = new Set(['url-to-pdf']);

/** The extensions a tool's main input may have; PDF unless it converts something else. */
export const TOOL_INPUT_TYPES: Record<string, string[]> = {
  'convert-file-to-pdf': ['doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'csv'],
  'eml-to-pdf': ['eml'],
  'html-to-pdf': ['html', 'htm', 'zip'],
  'img-to-pdf': IMAGE_TYPES,
  'markdown-to-pdf': ['md', 'markdown'],
};

export const optionVisible = (option: ToolOption, values: ToolOptionValues) => !option.when || option.when.is.includes(values[option.when.name] ?? '');

export function defaultToolValues(toolId: string): ToolOptionValues {
  const values: ToolOptionValues = {};
  // Options sharing a name stand for one field, so a later variant only fills it when nothing has yet.
  for (const option of STIRLING_TOOL_OPTIONS[toolId] ?? []) if (option.value !== undefined && values[option.name] === undefined) values[option.name] = option.value;
  return values;
}

/** Options that share a field name swap in their own default when the choice revealing them changes. */
export function applyToolOption(toolId: string, values: ToolOptionValues, name: string, value: ToolOptionValue): ToolOptionValues {
  const next = { ...values, [name]: value };
  const options = STIRLING_TOOL_OPTIONS[toolId] ?? [];
  for (const option of options) {
    if (option.when?.name === name && optionVisible(option, next) && options.filter(item => item.name === option.name).length > 1) next[option.name] = option.value ?? '';
  }
  return next;
}

const hasValue = (value: ToolOptionValue | undefined) => Array.isArray(value) ? value.length > 0 : value !== undefined && String(value).trim() !== '';

/** The first required input still missing, so the form can say so before the engine refuses. */
export const missingToolOption = (toolId: string, values: ToolOptionValues) => (STIRLING_TOOL_OPTIONS[toolId] ?? []).find(option => option.required && optionVisible(option, values) && !hasValue(values[option.name]));

/** The first filled value the engine would mishandle, so the form can refuse it instead of losing data silently. */
export function invalidToolOption(toolId: string, values: ToolOptionValues): TranslationKey | undefined {
  for (const option of STIRLING_TOOL_OPTIONS[toolId] ?? []) {
    const value = values[option.name];
    if (!optionVisible(option, values) || !hasValue(value)) continue;
    if (option.format && !option.format.pattern.test(String(value).trim())) return option.format.message;
    if (option.differsFrom && value === values[option.differsFrom.name]) return option.differsFrom.message;
  }
  return undefined;
}

export function toolParameters(toolId: string, values: ToolOptionValues): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const option of STIRLING_TOOL_OPTIONS[toolId] ?? []) {
    const value = values[option.name];
    if (option.name === ADDITIONAL_FILES || option.local || !optionVisible(option, values) || !hasValue(value)) continue;
    parameters[option.name] = option.name === 'languages' ? String(value).split(',') : option.name === 'counts' ? String(value).split(/[,\s]+/u).filter(Boolean) : value;
  }
  // Updating metadata rewrites every field, so an edit must not pass the API's sample values along.
  if (toolId === 'edit-metadata') for (const name of ['title', 'author', 'subject', 'keywords', 'creator', 'producer']) parameters[name] ??= '';
  if (toolId === 'reorder' && values.customMode !== 'CUSTOM' && values.customMode !== 'DUPLICATE') parameters.pageNumbers = 'all';
  // The engine reads the password without a null check, even for a key that has none.
  if (toolId === 'cert-sign') parameters.password ??= '';
  if (toolId === 'auto-redact' && values.redactPattern !== 'custom') Object.assign(parameters, { listOfText: REDACT_PATTERNS[String(values.redactPattern)], useRegex: true, wholeWordSearch: false });
  if (toolId === 'remove-password') {
    if (values.removeMode === 'all') parameters.removeAll = true;
    // Authenticating with the permissions password is what lets the engine drop that password alone.
    if (values.removeMode === 'permissions') parameters.sourcePassword = parameters.ownerPassword;
  }
  return parameters;
}
