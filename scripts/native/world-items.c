/* Authored common items use Melee's original item factory and callbacks. */
typedef unsigned int U;
typedef struct { float x,y,z; } Vec;
typedef struct { U parent,parent2,kind,hold,unknown; Vec pos,previous,velocity; float facing; U damage,unknown40,flags,ground; } Spawn;
typedef struct { U magic,count; Vec *positions; } Config;
_Static_assert(sizeof(Spawn)==0x4c,"retail spawn ABI");

__attribute__((section(".text.entry"))) void world_items_init(void) {
    ((void(*)(void))0x801c42ac)();
    U *table=*(U**)0x8049ed88;
    if(!table)return;
    U address=table[11];
    /* Older archives have only eleven slots. Never dereference arbitrary data. */
    if(address<0x80400000||address>0x817ffff0||(address&3))return;
    Config *config=(Config*)address;
    if(config->magic!=0x57535431||config->count>16)return;
    for(U i=0;i<config->count;i++) {
        Spawn spawn;
        for(U j=0;j<sizeof(spawn)/4;j++)((U*)&spawn)[j]=0;
        spawn.kind=29;spawn.pos=spawn.previous=config->positions[i];
        spawn.facing=1.0f;spawn.flags=0x80000000;
        ((void*(*)(Spawn*))0x80268b18)(&spawn);
    }
}
