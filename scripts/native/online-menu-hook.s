.section .text
.global online_menu_hook
online_menu_hook:
 stwu 1,-32(1)
 mflr 0
 stw 0,36(1)
 stw 30,24(1)
 stw 31,28(1)
 bl menu_input
 mr 31,3
 lis 4,0x804d
 lwz 4,0x6bb8(4)
 cmpwi 4,0
 beq done
 lwz 5,12(4)
 cmpwi 5,0
 beq done
 addi 5,5,-1
 slwi 5,5,3
 lwz 6,40(4)
 lwzx 5,6,5
 lwz 30,32(4)
 add 30,30,5
 lwz 5,0(30)
 lis 6,0x5454
 ori 6,6,0x524f
 cmpw 5,6
 bne done
 lwz 5,20(30)
 cmpwi 5,0
 bne ready
 lwz 3,12(30)
 lwz 4,16(30)
 bl flush_data
 lwz 3,12(30)
 lwz 4,16(30)
 bl invalidate_code
 li 5,1
 stw 5,20(30)
ready:
 mr 3,31
 mr 4,30
 lwz 12,8(30)
 mtctr 12
 bctrl
 mr 31,3
done:
 mr 3,31
 lwz 30,24(1)
 lwz 31,28(1)
 lwz 0,36(1)
 mtlr 0
 addi 1,1,32
 blr

# Change only a normal title -> root-menu entry. Returning from HRC/Multi-Man
# keeps the game's own menu selection and state.
.global online_start_menu
online_start_menu:
 lbz 0,0(3)
 cmpwi 0,0
 bnelr
 li 0,9
 blr
