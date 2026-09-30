import {DOWNLOAD_API} from './downloader-config.js';
const frame=document.getElementById('downloaderFrame');
frame.src=`${DOWNLOAD_API.replace(/\/$/,'')}/`;
frame.referrerPolicy='no-referrer';
