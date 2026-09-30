import {DOWNLOAD_API} from './downloader-config.js';
const frame=document.getElementById('downloaderFrame');
const frameWrap=document.getElementById('downloaderFrameWrap');
const contentWidth=440;
const contentHeight=680;
function fitFrame(){
	const availableWidth=frameWrap.clientWidth;
	if(!availableWidth)return;
	const scale=Math.min(1,availableWidth/contentWidth);
	frame.style.width=`${scale<1?contentWidth:availableWidth}px`;
	frame.style.height=`${contentHeight}px`;
	frame.style.transform=`scale(${scale})`;
	frameWrap.style.height=`${contentHeight*scale}px`;
}
new ResizeObserver(fitFrame).observe(frameWrap);
window.addEventListener('resize',fitFrame);
frame.src=`${DOWNLOAD_API.replace(/\/$/,'')}/`;
frame.referrerPolicy='no-referrer';
