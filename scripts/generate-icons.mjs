import { deflateSync } from 'zlib';
import fs from 'fs';

function crc32(buf) {
  const table = Array.from({length:256}, (_,i) => {
    let c=i;
    for(let j=0;j<8;j++) c=(c&1)?0xEDB88320^(c>>>1):c>>>1;
    return c;
  });
  let crc=0xFFFFFFFF;
  for(const b of buf) crc=table[(crc^b)&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}

function mkchunk(type, data) {
  const t=Buffer.from(type);
  const l=Buffer.alloc(4); l.writeUInt32BE(data.length);
  const c=Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t,data])));
  return Buffer.concat([l,t,data,c]);
}

function makePNG(size, r, g, b) {
  const hdr=Buffer.from([137,80,78,71,13,10,26,10]);
  const ih=Buffer.alloc(13);
  ih.writeUInt32BE(size,0); ih.writeUInt32BE(size,4);
  ih[8]=8; ih[9]=2;
  const row=1+size*3;
  const raw=Buffer.alloc(size*row);
  for(let y=0;y<size;y++) {
    raw[y*row]=0;
    for(let x=0;x<size;x++) {
      raw[y*row+1+x*3]=r; raw[y*row+2+x*3]=g; raw[y*row+3+x*3]=b;
    }
  }
  const comp=deflateSync(raw);
  return Buffer.concat([hdr,mkchunk('IHDR',ih),mkchunk('IDAT',comp),mkchunk('IEND',Buffer.alloc(0))]);
}

fs.writeFileSync('public/icon-192.png', makePNG(192, 11, 16, 32));
fs.writeFileSync('public/icon-512.png', makePNG(512, 11, 16, 32));
console.log('Icons generated: public/icon-192.png and public/icon-512.png');
