// SPDX-License-Identifier: MIT
// Offline release hygiene: scan only this plugin's reviewed source tree.
import fs from 'node:fs/promises'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'..')
const allowed=new Set(['lib','test','scripts','.github'])
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/,
  /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/]
let files=0
async function walk(directory,depth=0) {
  for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
    const filename=path.join(directory,entry.name)
    if(entry.isSymbolicLink())throw new Error('Release source must not contain symlinks')
    if(entry.isDirectory()) {if(depth>0 || allowed.has(entry.name))await walk(filename,depth+1);continue}
    if(!/\.(?:mjs|json|ya?ml|md)$/.test(entry.name) && !['LICENSE','.gitignore'].includes(entry.name))continue
    if(['registrations.json','credentials.enc.json','storage-key.bin'].includes(entry.name))throw new Error('Credential file in release tree')
    const content=await fs.readFile(filename,'utf8')
    if(patterns.some(p=>p.test(content)))throw new Error('Possible secret in '+path.relative(root,filename))
    if(/[A-Z]:\\Users\\/i.test(content))throw new Error('Personal device path in source')
    files++
  }
}
await walk(root)
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'))
if(pkg.scripts?.preinstall||pkg.scripts?.install||pkg.scripts?.postinstall)throw new Error('Unexpected install hook')
if(pkg.dependencies && Object.keys(pkg.dependencies).length)throw new Error('Review new runtime dependencies before release')
console.log(JSON.stringify({sourceHygiene:true,files,version:pkg.version,liveCredentialsRequired:false}))
