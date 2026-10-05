# Hosting adapter only. The original Corneria actor code runs every flight,
# bank, visibility/collision transition and shot. Hosted aircraft face their
# travel. Fox repeats/mirrors retail path 4 high then low, at 1.6x playback.
.text
.global world_arwing_init,world_arwing_tick,world_arwing_load,world_arwing_laser_hit
world_arwing_init:
 stwu 1,-32(1)
 mflr 0
 stw 0,36(1)
 stw 31,28(1)
 bl fox_init
 lis 4,0x804a
 lwz 4,-0x1278(4)
 lwz 4,0(4)
 li 5,-1
 stw 5,12(4)
 lwz 5,4(4)
 lis 6,0x804d
 stw 5,0x69a0(6)
 li 5,0
 stw 5,0x69ac(6)
 bl corneria_reset
 # Reference frame in place of Great Fox; no scenery/cannon callbacks.
 li 3,3
 bl Ground_GetStageGObj
 lwz 4,0x2c(3)
 li 5,0
 li 6,28
 mtctr 6
 addi 4,4,0xc0
clear_origin:
 stwu 5,4(4)
 bdnz clear_origin
 # Native background-region lookup needs its empty reference origin too.
 li 3,8
 bl Ground_GetStageGObj
 # Retail collision islands are activated by the native aircraft constructors.
 li 31,0
clear_coll:
 mr 3,31
 bl disable_collision
 addi 31,31,1
 cmpwi 31,8
 blt clear_coll
 lwz 31,28(1)
 lwz 0,36(1)
 mtlr 0
 addi 1,1,32
 blr

world_arwing_tick:
 lis 4,0x804a
 lwz 4,-0x1278(4)
 cmpwi 4,0
 beq boost
 lwz 4,0(4)
 cmpwi 4,0
 beq boost
 lwz 5,0(4)
 lis 6,0x434e
 ori 6,6,0x4152
 cmpw 5,6
 bne boost
 b corneria_schedule
boost:
 b world_wind

world_arwing_load:
 # Stock Corneria and Venom keep their original IDs and never touch BTT data.
 lis 4,0x804a
 lwz 4,-0x18b0(4)
 cmpwi 4,0x2d
 beq custom
 cmpwi 4,0x2e
 bne original
custom:
 # Select each world's aircraft before the native controller constructor.
 cmpwi 3,1
 bne remap
 lis 5,0x803e
 li 6,4
 cmpwi 4,0x2d
 beq ship_group
 # Fox: original near-flight 4, mirrored on successive passes. The counter
 # belongs to the course DAT and resets with Start+Z, never the user's save.
 li 6,4
 stw 6,0x1d74(5)
 lis 7,0x804a
 lwz 7,-0x1278(7)
 lwz 7,0(7)
 lwz 6,12(7)
 addi 6,6,1
 andi. 6,6,3
 stw 6,12(7)
 li 6,1
ship_group:
 stw 6,0x1d80(5)
remap:
 cmplwi 3,3
 bge original
 addi 3,3,19
original:
 b Ground_GetStageGObj

world_arwing_laser_hit:
 # Add 15 damage on actual hits; native hitstun and knockback remain intact.
 # Shields, reflection, missed shots and stock Corneria retain retail behavior.
 stwu 1,-32(1)
 mflr 0
 stw 0,36(1)
 stw 3,8(1)
 lis 4,0x804a
 lwz 5,-0x18b0(4)
 cmpwi 5,0x2d
 bne laser_done
 lwz 4,-0x1278(4)
 cmpwi 4,0
 beq laser_done
 lwz 4,0(4)
 cmpwi 4,0
 beq laser_done
 lwz 5,0(4)
 lis 6,0x434e
 ori 6,6,0x4152
 cmpw 5,6
 bne laser_done
 lwz 5,8(4)
 cmpwi 5,1
 bne laser_done
 lwz 4,0x2c(3)
 lwz 5,0xc34(4)
 cmpwi 5,0
 ble laser_done
 lwz 3,0xcf4(4)
 cmpwi 3,0
 beq laser_done
 lis 5,0x8045
 lwz 5,0x3130(5)
 cmpw 3,5
 bne laser_done
 lwz 4,0x2c(3)
 lwz 4,0x10(4)
 cmplwi 4,10
 ble laser_done
 lwz 3,0x2c(3)
 lis 4,laser_extra_damage@ha
 lfs 1,laser_extra_damage@l(4)
 bl fighter_damage
laser_done:
 lwz 3,8(1)
 lwz 0,36(1)
 mtlr 0
 addi 1,1,32
 # Replay the displaced first instruction of the retail laser callback.
 mflr 0
 b laser_hit_resume

laser_extra_damage:
 .float 15.0

.global world_arwing_heading,world_arwing_shot_heading
world_arwing_heading:
 # At the native translation setter: r28=root, stack+0x7c=new position.
 # f0/f1 and r0/r11/r12 are dead here; restore the displaced null comparison.
 lis 12,0x804a
 lwz 12,-0x18b0(12)
 cmpwi 12,0x2e
 beq fox_lower_pass
 cmpwi 12,0x2d
 bne heading_done
 b facing
fox_lower_pass:
 # Transform the original path before BOTH muzzle and collision updates.
 lis 12,0x804a
 lwz 12,-0x1278(12)
 lwz 12,0(12)
 lwz 12,12(12)
 andi. 0,12,1
 beq fox_height
 lfs 0,0x7c(1)
 fneg 0,0
 stfs 0,0x7c(1)
fox_height:
 slwi 12,12,2
 lis 11,fox_pass_drops@ha
 addi 11,11,fox_pass_drops@l
 lfsx 1,11,12
 lfs 0,0x80(1)
 fsubs 0,0,1
 stfs 0,0x80(1)
facing:
 lfs 0,0x38(28)
 lfs 1,0x7c(1)
 fcmpo 0,1,0
 lfs 0,-18492(2)
 ble heading_store
 fneg 0,0
heading_store:
 stfs 0,0x20(28)
heading_done:
 cmplwi 28,0
 b heading_resume

world_arwing_shot_heading:
 # Both native muzzle branches return to their own retail call site.
 li 11,0
 b shot_direction
.global world_arwing_fox_shot_heading
world_arwing_fox_shot_heading:
 li 11,1
shot_direction:
 lfs 1,-18440(2)
 lis 12,0x804a
 lwz 12,-0x18b0(12)
 addi 12,12,-0x2d
 cmplwi 12,1
 bgt shot_heading_done
 lwz 12,0x28(29)
 lfs 0,0x20(12)
 lfs 2,-18544(2)
 fcmpo 0,0,2
 ble shot_heading_done
 fneg 1,1
shot_heading_done:
 cmpwi 11,0
 beq wolf_shot_return
 b fox_shot_resume
wolf_shot_return:
 b shot_heading_resume
fox_pass_drops:
 # High first, then 160 native units lower; repeat on each return.
 .float -60.0,100.0,-60.0,100.0

.global world_arwing_start_path
world_arwing_start_path:
 stwu 1,-32(1)
 mflr 0
 stw 0,36(1)
 stw 31,28(1)
 mr 31,3
 bl retail_start_path
 lis 4,0x804a
 lwz 4,-0x18b0(4)
 cmpwi 4,0x2e
 bne path_started
 mr 3,31
 li 4,0
 li 5,7
 lis 6,fox_path_speed@ha
 lfs 1,fox_path_speed@l(6)
 bl set_path_rate
path_started:
 lwz 31,28(1)
 lwz 0,36(1)
 mtlr 0
 addi 1,1,32
 blr
fox_path_speed:
 .float 1.6
