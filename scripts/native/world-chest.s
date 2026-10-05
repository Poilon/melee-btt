# Target callbacks hosted in the retired Roy/Ganon BTT modules. No fighter,
# hitbox or counter writes. Ordinary targets delegate to the original counter.
.text
.global world_chest_init,world_chest_anim,world_chest_hit,world_chest_config
world_chest_init:
 # The stage archive survives Retry. Reset its mutable descriptor on EVERY
 # stage initialization; allocation identity is not an attempt identifier.
 stwu 1,-16(1)
 mflr 0
 stw 0,20(1)
 bl fox_init
 lis 4,0x804a
 lwz 4,-0x1278(4)
 cmpwi 4,0
 beq init_done
 lwz 4,0(4)
 cmpwi 4,0
 beq init_done
 lwz 5,0(4)
 lis 6,0x4348
 ori 6,6,0x5354
 cmpw 5,6
 bne init_done
 li 5,0
 stw 5,12(4)
 stw 5,16(4)
init_done:
 lwz 0,20(1)
 mtlr 0
 addi 1,1,16
 blr

world_chest_config:
 # r3 item GObj. Return r4 config, r5 item, r6 anchor; r4=0 otherwise.
 lis 4,0x804a
 lwz 5,-0x18b0(4)
 cmpwi 5,0x2a
 bne no_config
 lwz 4,-0x1278(4)
 cmpwi 4,0
 beq no_config
 lwz 4,0(4)
 cmpwi 4,0
 beq no_config
 lwz 5,0(4)
 lis 6,0x4348
 ori 6,6,0x5354
 cmpw 5,6
 bne no_config
 lis 7,0x804a
 lwz 7,-0x17b0(7)
 cmpwi 7,0
 beq no_config
 lwz 7,0x28(7)
 lwz 7,0x10(7)
 lwz 7,0x10(7)
 lwz 8,4(4)
 cmpwi 8,0
 beq match_anchor
find_anchor:
 cmpwi 7,0
 beq no_config
 lwz 7,8(7)
 addic. 8,8,-1
 bne find_anchor
match_anchor:
 lwz 5,0x2c(3)
 lwz 6,0xdd4(5)
 cmpw 6,7
 beqlr
no_config:
 li 4,0
 blr

world_chest_anim:
 stwu 1,-32(1)
 mflr 0
 stw 0,36(1)
 stw 29,20(1)
 stw 30,24(1)
 stw 31,28(1)
 mr 30,3
 bl world_chest_config
 cmpwi 4,0
 beq anim_done
 mr 31,4
 mr 29,6
 # All ten native targets exist from the beginning; conceal only this model.
 lwz 3,0xdd8(5)
 cmpwi 3,0
 beq anim_done
 li 4,16
 lwz 7,12(31)
 lwz 8,40(31)
 cmpw 7,8
 bge show_target
 bl hide_model
 b animate_lid
show_target:
 bl show_model
animate_lid:
 lwz 7,12(31)
 cmpwi 7,0
 beq anim_done
 lwz 8,40(31)
 cmpw 7,8
 bgt cooldown
 lfs 0,0x3c(29)
 lfs 1,24(31)
 fadds 0,0,1
 stfs 0,0x3c(29)
 mr 3,29
 bl dirty_joint
 # Reach the chest's root sibling, then its visual->body->lid rig.
 lis 3,0x804a
 lwz 3,-0x17b0(3)
 lwz 3,0x28(3)
 lwz 3,0x10(3)
 lwz 3,0x10(3)
 lwz 8,8(31)
find_chest:
 cmpwi 3,0
 beq cooldown
 cmpwi 8,0
 beq have_chest
 lwz 3,8(3)
 addi 8,8,-1
 b find_chest
have_chest:
 lwz 3,0x10(3)
 lwz 3,0x10(3)
 lwz 3,8(3)
 cmpwi 3,0
 beq cooldown
 lfs 0,16(31)
 lfs 1,28(31)
 fadds 0,0,1
 stfs 0,16(31)
 stfs 0,0x1c(3)
 bl dirty_joint
cooldown:
 lwz 7,12(31)
 lwz 8,44(31)
 cmpw 7,8
 bge anim_done
 addi 7,7,1
 stw 7,12(31)
anim_done:
 li 3,0
 lwz 29,20(1)
 lwz 30,24(1)
 lwz 31,28(1)
 lwz 0,36(1)
 mtlr 0
 addi 1,1,32
 blr

world_chest_hit:
 stwu 1,-16(1)
 mflr 0
 stw 0,20(1)
 bl world_chest_config
 cmpwi 4,0
 beq normal_hit
 lwz 5,12(4)
 cmpwi 5,0
 bne check_ready
 li 5,1
 stw 5,12(4)
 b keep_target
check_ready:
 lwz 6,44(4)
 cmpw 5,6
 bge normal_hit
keep_target:
 li 3,0
 b hit_done
normal_hit:
 bl target_counter
 li 3,1
hit_done:
 lwz 0,20(1)
 mtlr 0
 addi 1,1,16
 blr
