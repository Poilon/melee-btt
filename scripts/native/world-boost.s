# Reuses the retired Captain Falcon target-stage module at 0x8021FC64.
# All custom StageData entries already use the Fox initializer. Group 0's
# former no-op now supplies a damage-free impulse, only when slot 0 is BST1.
# Only volatile GPR/FPR and CR0 are used. No fighter action or inputs changed.
.text
.global world_boost
world_boost:
 lis 4,0x804a
 lwz 4,-0x1278(4)
 cmpwi 4,0
 beqlr
 lwz 4,0(4)
 cmpwi 4,0
 beqlr
 li 8,0
node:
 lwz 5,0(4)
 lis 6,0x4253
 ori 6,6,0x5431
 cmpw 5,6
 bnelr
 lis 5,0x8045
 lwz 5,0x3130(5)
 cmpwi 5,0
 beq reset
 lwz 5,0x2c(5)
 cmpwi 5,0
 beq reset
 lwz 6,0x10(5)
 cmplwi 6,14
 blt reset
 cmplwi 6,74
 bgt reset
 lfs 0,0xb0(5)
 lfs 1,4(4)
 fcmpo 0,0,1
 blt reset
 lfs 1,8(4)
 fcmpo 0,0,1
 bgt reset
 lfs 0,0xb4(5)
 lfs 1,12(4)
 fcmpo 0,0,1
 blt reset
 lfs 1,16(4)
 fcmpo 0,0,1
 bgt reset
 lwz 6,0xe0(5)
 cmpwi 6,0
 bne next
 lwz 6,24(4)
 cmpwi 6,0
 bne next
 li 6,1
 stw 6,24(4)
 lfs 0,20(4)
 stfs 0,0x8c(5)
 stfs 0,0xf0(5)
 lwz 6,28(4)
 addi 6,6,1
 stw 6,28(4)
 b next
reset:
 li 6,0
 stw 6,24(4)
next:
 lwz 4,32(4)
 cmpwi 4,0
 beqlr
 addi 8,8,1
 cmplwi 8,8
 bgelr
 b node
