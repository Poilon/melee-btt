# Whispy's local gust. Preserves controls and action state; no damage/hitstun.
.text
.global world_wind
world_wind:
 lis 4,0x804a
 lwz 4,-0x1278(4)
 cmpwi 4,0
 beq fallback
 lwz 4,0(4)
 cmpwi 4,0
 beq fallback
 lwz 5,0(4)
 lis 6,0x574e
 ori 6,6,0x4431
 cmpw 5,6
 bne fallback
 lis 5,0x8045
 lwz 5,0x3130(5)
 cmpwi 5,0
 beqlr
 lwz 5,0x2c(5)
 cmpwi 5,0
 beqlr
 lwz 6,0x10(5)
 cmplwi 6,14
 bltlr
 cmplwi 6,74
 bgtlr
 lfs 0,0xb0(5)
 lfs 1,4(4)
 fcmpo 0,0,1
 bltlr
 lfs 1,8(4)
 fcmpo 0,0,1
 bgtlr
 lfs 0,0xb4(5)
 lfs 1,12(4)
 fcmpo 0,0,1
 bltlr
 lfs 1,16(4)
 fcmpo 0,0,1
 bgtlr
 lis 6,0x8048
 lwz 6,-0x62a0(6)
 lwz 7,28(4)
 divwu 8,6,7
 mullw 8,8,7
 subf 6,8,6
 lwz 7,32(4)
 cmplw 6,7
 bltlr
 lwz 7,36(4)
 cmplw 6,7
 bgelr
 # The gust contributes a bounded external horizontal velocity. Native input
 # still controls self velocity; damage and the fighter state are untouched.
 lfs 0,20(4)
 stfs 0,0x8c(5)
 blr
fallback:
 b world_boost
