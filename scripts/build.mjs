import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { validateDataset } from '../src/model.js';
validateDataset(JSON.parse(await readFile(new URL('../data/picks.json',import.meta.url),'utf8')));
await rm('dist',{recursive:true,force:true});
await mkdir('dist');
for (const path of ['index.html','src','data']) await cp(path,`dist/${path}`,{recursive:true});
console.log('Built static app in dist/');
