import test from 'node:test';
import assert from 'node:assert/strict';
import {safeRelative,validateGroupListing} from '../scripts/grouped-payload.mjs';
const entry=(p='a/b.js',extra='')=>`Path = ${p}\nSize = 3\nAttributes = A\nEncrypted = -\n${extra}\n`;
test('grouped archive listing accepts exact ordinary files and Windows separators',()=>{
 validateGroupListing(entry(),new Map([['a/b.js',3]]));
 validateGroupListing(entry('a\\b.js'),new Map([['a/b.js',3]]));
});
test('grouped archive rejects traversal, absolute, ADS and Windows path aliases',()=>{
 for(const p of ['../outside','/outside','\\outside','C:/outside','a/../../outside','a//b','a/./b','a/b.','a/b ','a/b:stream'])assert.throws(()=>safeRelative(p),p);
});
test('grouped archive rejects duplicates, wrong size, unexpected and missing entries',()=>{
 const wanted=new Map([['a/b.js',3]]);
 for(const text of [entry()+entry('A/B.JS'),entry().replace('Size = 3','Size = 4'),entry('other'),'',entry().replace('Path = a/b.js','Path = a/b.js\nPath = a/b.js')])assert.throws(()=>validateGroupListing(text,wanted));
});
test('grouped archive rejects directories, symlinks, hardlinks and encrypted files',()=>{
 for(const extra of ['Folder = +\n','Symbolic Link = outside\n','Hard Link = outside\n','Reparse = 1\n'])assert.throws(()=>validateGroupListing(entry('a/b.js',extra),new Map([['a/b.js',3]])));
 assert.throws(()=>validateGroupListing(entry().replace('Attributes = A','Attributes = D'),new Map([['a/b.js',3]])));
 assert.throws(()=>validateGroupListing(entry().replace('Encrypted = -','Encrypted = +'),new Map([['a/b.js',3]])));
});
