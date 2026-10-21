const modern=['FAT16','FAT32','exFAT','HFS+'],legacy=['FAT16','FAT32','HFS+'];
export const PROFILES=[
 {id:'3000x',name:'CDJ-3000X',short:'3000X',fs:modern,source:'https://support.alphatheta.com/en-us/articles/48479834944025'},
 {id:'3000',name:'CDJ-3000',short:'3000',fs:modern,source:'https://support.alphatheta.com/en-us/articles/4406135001625'},
 {id:'nxs2',name:'CDJ-2000NXS2',short:'NXS2',fs:legacy,source:'https://www.pioneerdj.com/en/support/documents/player/archive/cdj-2000nxs2/'},
 {id:'az',name:'XDJ-AZ',short:'AZ',fs:modern,source:'https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/html/en/000COV_en/Product_overview/Product_overview.htm'},
 {id:'an',name:'XDJ-AN',short:'AN',fs:modern,source:'https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AN/html/es/000_XDJ-AN_IM_07_ES/Visi%C3%B3n_general_del_producto/Visi%C3%B3n_general_del_producto.htm'},
 {id:'xz',name:'XDJ-XZ',short:'XZ',fs:modern,source:'https://support.alphatheta.com/en-us/articles/4408364513817'},
 {id:'rx3',name:'XDJ-RX3',short:'RX3',fs:modern,source:'https://support.alphatheta.com/en-us/articles/4409195984281'},
 {id:'rr',name:'XDJ-RR',short:'RR',fs:legacy,source:'https://www.pioneerdj.com/en/support/documents/xdj-rr/?all=1'},
 {id:'duo',name:'OMNIS-DUO',short:'DUO',fs:modern,source:'https://support.alphatheta.com/en-us/articles/27722453642649'},
 {id:'quad',name:'OPUS-QUAD',short:'QUAD',fs:modern,source:'https://support.alphatheta.com/en-us/articles/16247058433305'},
];
export const REVIEWED='2026-10-21';
export function compatibility(profile,filesystem){return !filesystem?'unknown':profile.fs.includes(filesystem)?'supported':'unsupported';}
