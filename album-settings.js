export const DEFAULT_TITLE = '川上 公一郎';
export const DEFAULT_COLORS = {
  background: '#fbfaf7', surface: '#ffffff', text: '#2d2a26',
  muted: '#918a80', accent: '#ad9166', header: '#ffffff'
};
export const FONTS = {
  serif: '"Yu Mincho","Hiragino Mincho ProN",serif',
  sans: '-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif',
  rounded: '"Hiragino Maru Gothic ProN","Yu Gothic",sans-serif'
};
export function introEnabled(theme) {
  const value = theme?.intro_enabled;
  return value !== false && value !== 'false' && value !== 0 && value !== '0';
}
export function pageSettings(site) {
  const theme = site?.theme || {};
  const colors = Object.fromEntries(Object.entries(DEFAULT_COLORS).map(([key, fallback]) =>
    [key, /^#[0-9a-f]{6}$/i.test(theme[key] || '') ? theme[key] : fallback]));
  const size = Number(theme.title_size);
  return {
    title: site?.page_title?.trim() || DEFAULT_TITLE,
    eyebrow: site?.eyebrow_text ?? 'アルバム',
    header: site?.header_text ?? '',
    description: site?.intro_text ?? '',
    font: Object.hasOwn(FONTS, theme.title_font) ? theme.title_font : 'serif',
    size: Number.isFinite(size) && size >= 28 && size <= 80 ? size : 66,
    finalText: typeof theme.intro_final_text === 'string' ? theme.intro_final_text : '思い出',
    colors
  };
}
export function applyAppearance(element, settings) {
  const vars = {background:'bg',surface:'paper',text:'ink',muted:'mut',accent:'gold',header:'header'};
  for (const [key, name] of Object.entries(vars)) element.style.setProperty('--' + name, settings.colors[key]);
  // The approved year-album design uses an ivory gradient and an unboxed title.
  // Keep explicitly selected custom colors editable without importing the old layout.
  const ivory = settings.colors.background.toLowerCase() === DEFAULT_COLORS.background;
  element.style.setProperty('--page-background', ivory
    ? 'linear-gradient(180deg, #ffffff 0%, #fbfaf7 100%)'
    : settings.colors.background);
  element.style.setProperty('--hero-background', settings.colors.header.toLowerCase() === DEFAULT_COLORS.header
    ? 'transparent' : settings.colors.header);
  element.style.setProperty('--title-font', FONTS[settings.font]);
  element.style.setProperty('--title-size', settings.size + 'px');
}
export function uniqueIntroPhotos(selected = [], fallback = []) {
  const seen = new Set();
  return [...selected, ...fallback].filter(photo => {
    if (!photo?.image_path || seen.has(photo.image_path)) return false;
    seen.add(photo.image_path);
    return true;
  }).slice(0, 3);
}
