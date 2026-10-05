# GALE01, replaces grTFox_80220E5C (0xAC bytes). Return per-side stage damage.
.text
.global world_contact
world_contact:
 stwu 1,-32(1)
 mflr 0
 stw 0,36(1)
 stw 3,8(1)
 cmpwi 3,-1
 beq none
 bl mpJointFromLine
 # Corneria's eight collision islands precede the editor's authored islands.
 lis 4,0x804a
 lwz 4,-0x18b0(4)
 addi 4,4,-0x2d
 cmplwi 4,1
 bgt authored
 addi 3,3,-8
authored:
 cmplwi 3,1
 blt none
 cmplwi 3,10
 bgt none
 slwi 4,3,2
 lis 5,0x804a
 lwz 5,-0x1278(5)
 cmpwi 5,0
 beq none
 lwzx 5,5,4
 cmpwi 5,0
 beq none
 stw 5,12(1)
 lwz 3,8(1)
 bl mpLineGetKind
 cntlzw 3,3
 subfic 3,3,31
 mulli 3,3,36
 lwz 5,12(1)
 add 3,5,3
 b done
none:
 li 3,0
done:
 lwz 0,36(1)
 mtlr 0
 addi 1,1,32
 blr
