// Use the stored year for legacy year albums, otherwise preserve the custom title.
export const UNTITLED_ALBUM='タイトル未設定';
const YEAR_TITLE=/^((?:19|20)\d{2}|2100)年?$/;
export function isYearAlbum(label){return YEAR_TITLE.test(String(label??''))}
export function normalizeAlbumTitle(value){
  const input=String(value??'').trim(),match=input.match(YEAR_TITLE),year=match?.[1]||null;
  return {key:year||input,title:year?year+'年':input,album_date:year?year+'-01-01':null};
}
export function albumLabel(album){
  const date=String(album?.album_date??'').match(/^((?:19|20)\d{2}|2100)-/);
  if(date)return date[1];
  const title=String(album?.title??'').trim(),year=title.match(YEAR_TITLE);
  return year?year[1]:title||UNTITLED_ALBUM;
}
export function compareAlbumLabels(a,b){
  const aYear=isYearAlbum(a),bYear=isYearAlbum(b);
  if(aYear&&bYear)return Number(b)-Number(a);
  if(aYear)return -1;
  if(bYear)return 1;
  if(a===UNTITLED_ALBUM)return 1;
  if(b===UNTITLED_ALBUM)return -1;
  return 0; // Keep the source order (newest first) for named albums.
}
