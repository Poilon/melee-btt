# Stage hosting only: complete retail enemies and Onett traffic callbacks.
.text
.global world_retail_init
world_retail_init:
 stwu 1,-48(1)
 mflr 0
 stw 0,52(1)
 stmw 29,36(1)
 bl fox_init
 lis 4,0x804a
 lwz 4,-0x1278(4)
 lwz 31,0(4)
 lwz 3,4(31)
 cmpwi 3,0
 beq enemies
 lis 4,0x804d
 stw 3,0x69c0(4)
 li 3,3
 bl onett_factory
 cmpwi 3,0
 beq enemies
 lwz 4,0x2c(3)
 # Keep only the native right-to-left state machine. The reverse lane sleeps.
 li 5,7
 stb 5,0x119(4)
enemies:
 lwz 30,8(31)
 lwz 29,12(31)
 cmpwi 30,0
 beq done
spawn:
 lwz 3,0(29)
 addi 4,29,4
 li 5,0
 li 6,0
 li 7,1
 bl native_zako_spawn
 addi 29,29,16
 addic. 30,30,-1
 bne spawn
done:
 lmw 29,36(1)
 lwz 0,52(1)
 mtlr 0
 addi 1,1,48
 blr
