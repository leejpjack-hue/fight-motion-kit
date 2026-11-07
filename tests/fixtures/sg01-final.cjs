/* TRANSPORT ONLY: deterministic numbered pixels, no producer run/art/authenticity.
 * Full FINAL writer at pin 6a3f4c47d7f8745853cc06fe66b252636976a442:
 * https://github.com/aldegad/sprite-gen/blob/6a3f4c47d7f8745853cc06fe66b252636976a442/sprite_gen/video/loop.py#L3200-L3289
 * _cell_record L2388-2417; build_strip L782-892; held_fill.public L497-515;
 * held.measure L83-132; nonloop.metadata L197-204; root_motion.sidecar L142-172.
 * Earlier tests intentionally retain intermediate build_strip coverage separately. */
const zlib=require('node:zlib'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const digits=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
function chunk(type,data){
  const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);let c=0xffffffff;
  for(const n of b.subarray(4,-4)){c^=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}
  b.writeUInt32BE((c^0xffffffff)>>>0,b.length-4);return b;
}
function numbered(numbers){
  const width=numbers.length*24,height=24,rows=Buffer.alloc((width+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const cell=Math.floor(x/24),cx=x%24,dx=Math.floor((cx-9)/2),dy=Math.floor((y-6)/2);
    rows[y*(width+1)+x+1]=cx===0||cx===23||y===0||y===23?80:
      dx>=0&&dx<3&&dy>=0&&dy<5&&digits[numbers[cell]%10][dy*3+dx]==='1'?255:20+numbers[cell]*6;
  }
  const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
function finalTransport(kind='periodic',feet=false){
  const samples=kind==='periodic'?[0,2,4,6]:[0,2,5,7],start=kind==='once-return'?0:3,frames=kind==='once-return'?8:14;
  const png=numbered(samples.map(k=>start+k)),r={frames:4,sample_indices:samples,source_rect:feet?null:[-6,2,18,26],w:24,h:24,
    kind,loop:kind==='periodic',body_h:16,body_src_h:16,body_ref:'first-frame',scale:1,delay_ms:83.33,fps:12,
    cycle_frames:8,cycle_seconds:.3333,subsampled:true,cell_cap:4,top_margin_px:2,cell_height_cap:24,body_height_target:16,
    foot_anchor:feet?'feet':'none',drift_px:0,foot_sway_px:0,foot_x:feet?12:null,
    source_cut:{source:{kind:'keyed-frame-sequence',sha256:hash(Buffer.concat(Array.from({length:frames},(_,i)=>Buffer.from(hash(numbered([i])), 'hex')))),frames,fps:24},start,length:8,samples:samples.map(k=>start+k)},
    drawings:{hold:1,drawings_per_second:24,contrast:{'2':1,'3':1},frames},
    cycle_drawings:{start,length:8,steps:frames===8?7:8,hold:1,drawings_per_second:24,contrast:{'2':1,'3':1}},
    held_fill:{mode:'auto',cells:8,poses:8,held_runs:[],made:[],before:{cells:8,poses:8,held_runs:[]}},holds:[],
    cell_record:{strip_sha256:hash(png),cells:samples.map(k=>({source_frame:start+k,anchor_move_px:[0,0],scale:{size_hold:1,gait_fallback:1},as_filmed:true}))}};
  if(feet)r.anchor=[12,24];
  if(kind!=='periodic'){
    Object.assign(r,{loop:false,hold_last:kind==='once',...(kind==='once-return'?{returns:true}:{}),end_frame:3,events:[{frame:2,name:'motion_peak'}]});
    // This field is INEVITABLE in final once/once-return. Deliberately unsupported.
    r.root_motion=feet?{why:'the cells are each moved to a foot line of their own (--anchor feet): no one rectangle maps a frame to its cell'}:
      {point:'mass-centre',root:samples.map(()=>[12,16]),ground_y:24,contacts:[{by:'ground',cells:[0,3]}],air:[]};
  }
  return {raw:r,png,json:Buffer.from('\uFEFF'+JSON.stringify(r,null,2)+'\n')};
}
module.exports={finalTransport,numbered,hash};
