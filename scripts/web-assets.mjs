import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export async function versionWebAssets(base, output) {
  const names=(await readdir(resolve(base,'assets'))).filter(name=>/\.(js|css)$/.test(name)).sort();
  const files=await Promise.all(names.map(async name=>[name,await readFile(resolve(base,'assets',name),'utf8')]));
  const policy=await readFile(resolve(base,'upload-service/lib/upload-policy.mjs'),'utf8');
  const version=createHash('sha256').update(JSON.stringify(files)).update(policy).digest('hex').slice(0,16);
  // Every imported module gets the same release ID, including unchanged dependencies.
  // Only this explicitly public policy module is copied from the receiver source.
  for(const [name,source] of [...files.filter(([name])=>name.endsWith('.js')),['upload-policy.js',policy]]) {
    const code=source.replace(/(\bfrom\s+|\bimport\s*)(['"])(\.\.?\/[^'"?]+\.(?:mjs|js))\2/g,(_,prefix,quote,path)=>{
      const target=path==='../upload-service/lib/upload-policy.mjs'?'./upload-policy.js':path;
      return `${prefix}${quote}${target}?v=${version}${quote}`;
    });
    await writeFile(resolve(output,'assets',name),code);
  }
  const html=await readFile(resolve(output,'index.html'),'utf8');
  await writeFile(resolve(output,'index.html'),html.replace(/((?:src|href)="\.\/assets\/[^"?]+\.(?:js|css))"/g,`$1?v=${version}"`));
  return version;
}
