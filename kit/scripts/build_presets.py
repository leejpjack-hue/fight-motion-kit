"""Generate presets/camera_presets.json + presets/fx_presets.json.
Camera curves are faithful transcriptions of camBase(t) in
fight-zhao-min-hua-fei-rooftop-2026-10-19/index.html L59-87.
Curve types (u = normalized 0..1 time inside the atom, tl = seconds since atom start):
  const   {v}
  lerp    {a,b,ease: smooth|linear|sine}          a + (b-a)*ease(u)
  saw     {a,b,period_s}                          a + (b-a)*frac(tl/period_s)   (micro jitter pulse)
  sin     {offset,amp,cycles|omega,phase}        offset + amp*sin(2pi*cycles*u + phase)  or  sin(omega*tl + phase)
  alt_bump{offset,amp,n}                          k=n*u; offset + (floor(k)%2?1:-1)*amp*sin(frac(k)*pi)
Defaults when a channel is absent: x=0, y=0, s=1.12, r=0. Player/composer clamp s >= 1+|sin(r)|*0.9 (as camBase).
"""
import json, os
K = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def L(a,b,e="smooth"): return {"type":"lerp","a":a,"b":b,"ease":e}
def C(v): return {"type":"const","v":v}
P = []
def add(id, angle, move, curves, src, plates=None, derived=True, native=1.0, kind="duo", note=""):
    P.append({"id":id,"angle":angle,"move":move,"native_duration_s":native,"default_kind":kind,
              "derived":derived,"comment":src + ((" | " + note) if note else ""),
              "source_plates":plates,"curves":curves})
add("low_rise","low","rise",{"y":L(170,0),"s":L(1.4,1.12)},"camBase seg t∈[0,1): y 170→0, s 1.4→1.12","P01-P02")
add("eye_orbit","eye","orbit",{"x":L(-70,70),"r":L(-3,3)},"camBase seg t∈[1,2): x −70→70, roll −3→3","P03-P04")
add("eye_push","eye","push_in",{"y":L(0,50),"s":L(1.14,1.26)},"camBase seg t∈[2,3): y 0→50, s 1.14→1.26","P05-P06")
add("ecu_jitter","ecu","hold",{"s":{"type":"saw","a":1.0,"b":1.1,"period_s":0.5},"x":{"type":"saw","a":-12,"b":12,"period_s":0.5}},
    "camBase seg t∈[4,5.5): 0.5s saw pulse on s 1.0→1.1 and x −12→12 (variants t∈[14,15) y-pulse, t∈[21,22) s-only via params)","P09-P11 / P29-P30 / P43-P44",native=1.5,kind="close")
add("low_dive_under","low","dive",{"s":C(1.2),"y":L(-50,-20)},"camBase seg t∈[5.5,6): s 1.2, y −50→−20 (0.5s native; use inside camera.segments)","P12",native=0.5)
add("upward_inside","upward_inside","push_in",{"s":L(1.32,1.22),"y":L(60,30),"r":L(4,1)},"camBase seg t∈[6,7): s 1.32→1.22, y 60→30, roll 4→1","P13-P14")
add("ots_R_hold","waist_ots_R","hold",{"s":C(1.26),"x":L(50,10)},"camBase seg t∈[7,8): s 1.26, x 50→10 (R fighter nearer camera)","P15-P16")
add("eye_lateral","eye","lateral",{"x":L(-90,90),"s":C(1.18)},"camBase seg t∈[8,9): x −90→90, s 1.18 (t∈[12,13) = reverse x 90→−90, y −45, s 1.2 via params)","P17-P18 / P25-P26")
add("waist_ots_chase","waist_ots_L","lateral",{"x":L(0,-70),"s":C(1.15),"y":{"type":"sin","offset":0,"amp":4,"omega":20,"phase":0}},
    "camBase seg t∈[9,10): x 0→−70, s 1.15, y=sin(t*20)*4 (parity sets phase=180 = 20*9)","P19-P20")
add("fence_sweep_roll","low","fence_sweep",{"y":L(0,90),"r":L(0,-7),"s":C(1.22)},"camBase seg t∈[10,11): y 0→90, roll 0→−7, s 1.22","P21-P22")
add("floor_hold","floor","hold",{"y":L(-30,-60),"s":C(1.24),"r":L(-4,0)},"camBase seg t∈[11,12): y −30→−60, s 1.24, roll −4→0","P23-P24")
add("eye_hold","eye","hold",{"x":L(-20,-50),"s":C(1.34)},"camBase seg t∈[13,14): x −20→−50, s 1.34","P27-P28")
add("floor_race","floor","push_in",{"s":L(1.08,1.42),"y":C(-30)},"camBase seg t∈[15,16): s 1.08→1.42, y −30 (racing through gap)","P31-P32")
add("whip_A_to_B","eye","whip_pan",{"x":{"type":"sin","offset":0,"amp":190,"cycles":2,"phase":0},"s":C(1.25)},
    "camBase seg t∈[16,17): x=sin((t−16)*4π)*190, s 1.25 (t∈[19,21) variant: offset −90, amp 140, cycles 1, s 1.4→1.5 linear via params)","P33-P34 / P39-P42")
add("high_dive","high","dive",{"s":L(1.0,1.5),"y":L(-80,-20),"x":L(0,-180)},"camBase seg t∈[17,18): s 1.0→1.5, y −80→−20, x 0→−180","P35-P36")
add("box_side_pan","low_side","lateral",{"s":C(1.42),"x":L(-180,-90),"y":L(-20,-40)},"camBase seg t∈[18,19): s 1.42, x −180→−90, y −20→−40","P37-P38")
add("face_whip","eye","whip_pan",{"x":{"type":"alt_bump","offset":-80,"amp":120,"n":4},"s":C(1.45)},"camBase seg t∈[22,23): alternating whip x=−80±120*sin(frac(4u)π), s 1.45","P45-P46")
add("pass_between","eye","orbit",{"x":{"type":"sin","offset":-80,"amp":130,"cycles":3,"phase":0},"s":L(1.35,1.55),"y":L(-20,-40,"linear")},
    "camBase seg t∈[23,26): x=−80+sin(2πk)*130 (3 cycles), s 1.35→1.55 smooth, y −20→−40 linear; parity splits with u_range","P47-P52",native=3.0)
add("dutch_spiral","dutch","spiral",{"r":L(-8,-24),"s":L(1.12,1.45),"y":L(-30,10,"linear"),"x":{"type":"sin","offset":0,"amp":40,"cycles":0.75,"phase":0}},
    "camBase seg t∈[26,30): roll −8→−24, s 1.12→1.45, y −30→10 linear, x=sin(1.5πk)*40","P53-P60",native=4.0)
add("ecu_fist_lens","ecu","push_in",{"s":L(1.2,1.38),"x":L(20,-30)},"camBase seg t∈[3,4): s 1.2→1.38, x 20→−30 (fist toward lens)","P07-P08")
# --- invented (not a camBase segment) ---
add("low_hold","low","hold",{"s":C(1.18),"y":L(30,20)},"INVENTED: low static hold with 10px settle",derived=False)
add("high_hold","high","hold",{"s":C(1.1),"y":L(-40,-50)},"INVENTED: high static hold with slight drift",derived=False)
add("ots_L_hold","waist_ots_L","hold",{"s":C(1.26),"x":L(-50,-10)},"INVENTED: mirror of ots_R_hold (camBase t∈[7,8))",derived=False)
add("pull_aftermath","eye","pull_out",{"s":L(1.4,1.1),"y":L(-20,0)},"INVENTED: pull-out aftermath",derived=False)
add("rise_from_floor","floor","rise",{"y":L(120,0),"s":L(1.3,1.15),"r":L(2,0)},"INVENTED: floor-to-eye rise (inverse of low_dive_under)",derived=False)
assert len(P)==25 and len({p['id'] for p in P})==25
json.dump({"version":"p0","source":"fight-zhao-min-hua-fei-rooftop-2026-10-19/index.html camBase(t)","curve_doc":__doc__,
           "defaults":{"x":0,"y":0,"s":1.12,"r":0},"roll_scale_clamp":0.9,"presets":P},
          open(f"{K}/presets/camera_presets.json","w"),ensure_ascii=False,indent=1)

FX = [
 {"id":"hit_orange","components":["hitstop_2f","flash","shake","impact_burst"],"color":"#ff8a1e","source":"HITS[] orange","defaults":{}},
 {"id":"hit_pink","components":["hitstop_2f","flash","shake","impact_burst"],"color":"#ff3fa4","source":"HITS[] pink","defaults":{}},
 {"id":"hitstop_2f","components":["hitstop_2f"],"source":"renderAt: grayscale(1) contrast(9) invert(1) for 2/24 s after each hit","defaults":{}},
 {"id":"flash_orange","components":["flash"],"color":"#ff8a1e","source":"#flash screen-blend 0.28s, starts 2/24 s after hit","defaults":{}},
 {"id":"flash_pink","components":["flash"],"color":"#ff3fa4","source":"#flash","defaults":{}},
 {"id":"bg_flash_blue","components":["tint"],"color":"#2f7bff","source":"BGFLASH 4.0 (#tint colour-blend 0.45s)","defaults":{}},
 {"id":"bg_flash_teal","components":["tint"],"color":"#19e0d0","source":"BGFLASH 21.0","defaults":{}},
 {"id":"shake","components":["shake"],"source":"shake(): 14px decaying over 0.32s (also implied by every hit_*)","defaults":{"amp":14,"dur":0.32}},
 {"id":"smear_trail","components":["trail"],"source":"TRAILS[] white fist-wind arcs 0.18s","defaults":{"dir":1}},
 {"id":"dust","components":["dust"],"source":"DUST[] floor puffs 0.6s","defaults":{"k":1}},
 {"id":"speed_lines","components":["speed"],"source":"SPEED[] up|down|radial spans","defaults":{"mode":"up","k0":0,"k1":1},"span":True},
 {"id":"sparks","components":["sparks"],"source":"SPARKS[] 0.5s; optional fixed screen point 'at'","defaults":{"n":40}},
 {"id":"fence_shake","components":["fence"],"source":"FENCE[] bg-only rattle + 3k px shake","defaults":{"k":1},"span":True},
 {"id":"pink_cut","components":["pink_cut"],"color":"#ff2f9a","source":"t>=29.9 full pink card","defaults":{}},
]
json.dump({"version":"p0","t_rel":"normalized 0..1 inside the atom (t_rel_end for span hooks)",
           "builtin_per_plate":["ghost_smear (prev pose, blur, first 0.12s of each plate)","motion_blur from camera velocity","bg parallax 0.25x/0.2x","close-plate push scale(1+0.12*pt)"],
           "hooks":FX},open(f"{K}/presets/fx_presets.json","w"),ensure_ascii=False,indent=1)
print("ok",len(P),len(FX))
