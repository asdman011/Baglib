import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import electron from 'electron';
const directory=fs.mkdtempSync(path.resolve('.baglib-data/wave6-live-'));
const evidence = fs.mkdtempSync(path.resolve('.baglib-data/k317-wave6-evidence-'));
let code = 1;
try {
const engine=path.resolve('.baglib-data/pdf-engine');
const media=path.join(directory,'media');fs.mkdirSync(media);
// A copy of a cached recitation MP3 with a chapter tag put in front; the cached file is only read.
const syncsafe=value=>Buffer.from([(value>>21)&0x7f,(value>>14)&0x7f,(value>>7)&0x7f,value&0x7f]);
const u32=value=>{const buffer=Buffer.alloc(4);buffer.writeUInt32BE(value>>>0);return buffer;};
const chapter=(id,start,title)=>{const text=Buffer.concat([Buffer.from([3]),Buffer.from(title,'utf8')]);const tit2=Buffer.concat([Buffer.from('TIT2'),syncsafe(text.length),Buffer.alloc(2),text]);const body=Buffer.concat([Buffer.from(`${id}\0`),u32(start),u32(start+1000),u32(0xffffffff),u32(0xffffffff),tit2]);return Buffer.concat([Buffer.from('CHAP'),syncsafe(body.length),Buffer.alloc(2),body]);};
const frames=Buffer.concat([chapter('c1',0,'المقدمة'),chapter('c2',2000,'الباب الأول')]);
const audioRoot=path.join(process.env.APPDATA,'baglib','quran','audio');
const recitation=fs.readdirSync(audioRoot).map(item=>path.join(audioRoot,item,'001_002.mp3')).find(fs.existsSync);
if(!recitation)throw new Error('A cached recitation MP3 is needed');
let audio=fs.readFileSync(recitation);
if(audio.toString('latin1',0,3)==='ID3')audio=audio.subarray(10+((audio[6]<<21)|(audio[7]<<14)|(audio[8]<<7)|audio[9]));
fs.writeFileSync(path.join(media,'درس صوتي.mp3'),Buffer.concat([Buffer.from('ID3'),Buffer.from([4,0,0]),syncsafe(frames.length),frames,audio]));
// A cover rendered from known text, and an image-only verse page for the Hub.
const weasyprint=path.join(engine,'weasyprint','weasyprint.exe');
const pdftoppm=fs.readdirSync(path.join(engine,'poppler')).map(item=>path.join(engine,'poppler',item,'Library','bin','pdftoppm.exe')).find(fs.existsSync);
const cover=`<html lang="ar" dir="rtl"><meta charset="utf-8"><style>@page{size:12cm 18cm;margin:1cm}body{font-family:Arial;text-align:center}h1{font-size:44pt;margin-top:3cm}h2{font-size:22pt}p{font-size:16pt;margin-top:3cm}</style><body><h1>رياض الصالحين</h1><p>تأليف: الإمام النووي</p><p style="margin-top:4cm;font-size:12pt">دار الكتب</p></body></html>`;
fs.writeFileSync(path.join(media,'cover.html'),cover);
spawnSync(weasyprint,[path.join(media,'cover.html'),path.join(media,'cover.pdf')]);
spawnSync(pdftoppm,['-r','150','-png','-singlefile',path.join(media,'cover.pdf'),path.join(media,'cover')]);
const python=path.join(engine,'venv','Scripts','python.exe');
spawnSync(python,['-c',`from PIL import Image;Image.open(r"${path.resolve('.baglib-data/ocr-benchmark/set/verse-layout-scan.png')}").convert("RGB").save(r"${path.join(media,'verse.pdf')}",resolution=300)`]);
fs.copyFileSync(path.resolve('.baglib-data/ocr-benchmark/set/verse-layout-scan.txt'),path.join(media,'verse.txt'));
fs.writeFileSync(path.join(media,'sources.json'),JSON.stringify({version:1,updated:'2026-12-01',sources:{libgen:['https://libgen.example'],annas:['https://annas.example']}}));
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const realPdf = lang => manifest.files.filter(file => file.kind === 'pdf' && file.lang === lang && file.textLayer === 'yes').sort((a, b) => a.bytes - b.bytes)[0];
const realFiles = ['ar', 'en'].map(lang => ({ id: `wave6-real-${lang}`, lang, page: lang === 'ar' ? 2 : 200, filename: path.resolve('tests/real-files', realPdf(lang).path) }));
const wma = manifest.files.find(file => file.kind === 'audio' && file.lang === 'en');
const wmaCopy = path.join(media, 'real-english.wma');
fs.copyFileSync(path.resolve('tests/real-files', wma.path), wmaCopy);
const scan = manifest.files.find(file => file.kind === 'pdf' && file.textLayer === 'no');
const scanSample = path.join(media, 'real-arabic-scan.pdf');
const sampled = spawnSync(python, ['-c', 'import sys,fitz;r=fitz.open(sys.argv[1]);w=fitz.open();w.insert_pdf(r,from_page=4,to_page=4);w.save(sys.argv[2]);w.close();r.close()', path.resolve('tests/real-files', scan.path), scanSample], { encoding: 'utf8' });
if (sampled.status !== 0) throw Error(sampled.stderr || 'Real scanned PDF sampling failed');
fs.writeFileSync(path.join(directory, 'real-files.json'), JSON.stringify({ pdfs: realFiles, unsupportedAudio: wmaCopy, scanSample }));
const env={...process.env,BAGLIB_REGISTER_PROTOCOL: '0',BAGLIB_DATA_DIR:directory,BAGLIB_WAVE6_LIVE_DIR:directory,BAGLIB_WAVE6_POPPLER:path.dirname(pdftoppm)};delete env.ELECTRON_RUN_AS_NODE;
code = await new Promise((resolve, reject) => {
  const child=spawn(electron,['scripts/wave6-live/main.cjs',`--user-data-dir=${directory}`,'--disable-features=CalculateNativeWinOcclusion','--autoplay-policy=no-user-gesture-required'],{env,stdio:'inherit',windowsHide:true});
  child.once('error', reject);
  child.once('exit', result => resolve(result ?? 1));
});
} finally {
  for (const name of fs.readdirSync(directory)) {
    if (/\.(png|json|txt)$/.test(name)) fs.copyFileSync(path.join(directory, name), path.join(evidence, name));
  }
  const resolved = fs.realpathSync(directory);
  if (path.dirname(resolved) !== fs.realpathSync('.baglib-data')) throw Error('Unexpected profile path');
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log(JSON.stringify({ evidence, code, profileDeleted: true }));
}
process.exitCode = code;
