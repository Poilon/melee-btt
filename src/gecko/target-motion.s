# Melee USA 1.02, itMato_UnkMotion0_Phys epilogue at 802D85D8.
# r31 = Item*. Vanilla has just restored the anchor from the fixed stage joint.
# A generated bl skips the inline table and puts its address in LR.
# Only caller-saved registers are used; the original epilogue restores LR/r31.
# Table: u16 internal stage, u16 count, count * 20-byte rows; FFFFFFFF terminator.
# Row: float anchorX/Y, deltaX/Y; u16 leg frames, u8 delay/4, u8 mode (1/2).
.text
.global target_motion
target_motion:
    mflr 6
    lis 4,0x804a
    lwz 4,-0x18b0(4)             # stage_info.internal_stage_id = 8049E750
stage_loop:
    lhz 5,0(6)
    cmplwi 5,0xffff
    beq done
    lhz 7,2(6)
    addi 6,6,4
    cmpw 4,5
    beq find_target
    mulli 7,7,20
    add 6,6,7
    b stage_loop
find_target:
    lwz 8,0x4c(31)
    lwz 9,0x50(31)
row_loop:
    cmpwi 7,0
    beq done
    lwz 10,0(6)
    cmpw 8,10
    bne next_row
    lwz 10,4(6)
    cmpw 9,10
    beq move_target
next_row:
    addi 6,6,20
    addi 7,7,-1
    b row_loop
move_target:
    lis 4,0x8047
    lwz 3,-0x4938(4)             # timer seconds, 8046B6C8
    mulli 3,3,60
    lhz 5,-0x4934(4)             # fractional timer frames, 8046B6CC
    add 3,3,5
    lbz 5,18(6)
    slwi 5,5,2
    subf. 3,5,3
    ble done                    # hold at anchor through the seeded start delay
    lhz 7,16(6)
    divwu 8,3,7
    mullw 9,8,7
    subf 9,9,3                  # remainder within leg
    andi. 8,8,1                 # alternating outbound/return leg
    lbz 10,19(6)
    cmpwi 10,2
    bne drift
    mulli 9,8,1
    li 7,1                      # teleport fraction = parity / 1
    b fraction
drift:
    cmpwi 8,0
    beq fraction
    subf 9,9,7                  # return leg: 1 - remainder / legFrames
fraction:
    stwu 1,-0x20(1)
    lis 0,0x4b00                # exact unsigned int -> float for small values
    stw 0,8(1)
    lfs 3,8(1)                  # 2^23
    or 9,9,0
    stw 9,12(1)
    lfs 0,12(1)
    fsubs 0,0,3
    or 7,7,0
    stw 7,12(1)
    lfs 1,12(1)
    fsubs 1,1,3
    fdivs 0,0,1
    lfs 1,0(6)
    lfs 2,8(6)
    fmadds 1,2,0,1
    stfs 1,0x4c(31)
    lfs 1,4(6)
    lfs 2,12(6)
    fmadds 1,2,0,1
    stfs 1,0x50(31)
    addi 1,1,0x20
done:
    lwz 0,0x2c(1)              # displaced original instruction
