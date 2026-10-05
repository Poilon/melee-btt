/* Native Melee NTSC 1.02 UI. HTTPS and credentials live in the host helper.
 * The archive owns all UI allocations. No heap pointers survive a scene change.
 * Host writes only [256,860); the request sequence is committed after its fields.
 */
typedef unsigned int U;
typedef struct {float x,y,z,w,h,pad[4],sx,sy;U bg,color;float pad2[4];unsigned short flags[2];unsigned char fitting,kerning,align,pad3,depth,hidden,fontpad,font;} Text;
typedef struct {char name[28];U frames,rank;} Row;
typedef struct {
 U magic,version;void *entry,*code;U length,initialized;Text *text;
 U ticks,screen,selection,edit,key,mode,keypage,lastAck,dirty;
 volatile U req,op,character,offset,row;char username[28],password[132];U reserved[3];
 volatile U ack,status,signedIn,count,total;char error[128],identity[28],title[64];Row rows[10];volatile U heartbeat;
 U lastHeartbeat,heartbeatTick,pendingTick;Text *identityText;U context,shift,accountReturn;
 Text *companionText;U layoutReady,originalRows,originalDescriptions,stadiumRows[18];unsigned short stadiumDescriptions[6];
} State;
_Static_assert(sizeof(State)<=1024,"archive state allocation");
_Static_assert(__builtin_offsetof(State,req)==64,"request layout");
_Static_assert(__builtin_offsetof(State,ack)==256,"response layout");
_Static_assert(__builtin_offsetof(State,heartbeat)==856,"heartbeat layout");
#define NEW ((Text*(*)(int,int))0x803A6754)
#define ADD ((int(*)(Text*,float,float,const char*,...))0x803A6B98)
#define UPDATE ((int(*)(Text*,int,const char*,...))0x803A70A0)
#define COLOR ((void(*)(Text*,int,U*))0x803A74F0)
#define CONTEXT ((int(*)(int,void*,int,int,int,int,int,int))0x803A611C)
#define FREE ((void(*)(Text*))0x803A5CC4)
#define FORMAT ((int(*)(char*,const char*,...))0x80323CF4)
#define UP 1
#define DOWN 2
#define LEFT 4
#define RIGHT 8
#define A 0x10
#define B 0x20
#define L 0x40
#define R 0x80
#define START 0x100
#define X 0x400
#define Y 0x800
static const char *characters[]={"Dr. Mario","Mario","Luigi","Bowser","Peach","Yoshi","Donkey Kong","Captain Falcon","Ganondorf","Falco","Fox","Ness","Ice Climbers","Kirby","Samus","Zelda","Sheik","Link","Young Link","Pichu","Pikachu","Jigglypuff","Mewtwo","Mr. Game & Watch","Marth","Roy"};
// Extend only the Stadium's runtime layout. Gameplay DOL bytes and course IDs
// remain unchanged; restore archive-owned pointers before leaving this menu.
#define STADIUM ((U*)(0x803eb6b0+9*20))
static void layout(State*s){
 if(!s->layoutReady){
  s->originalRows=STADIUM[0];s->originalDescriptions=STADIUM[2];
  for(int i=0;i<15;i++)s->stadiumRows[i]=((U*)s->originalRows)[i];
  for(int i=0;i<3;i++)s->stadiumRows[15+i]=s->stadiumRows[i];
  for(int i=0;i<5;i++)s->stadiumDescriptions[i]=((unsigned short*)s->originalDescriptions)[i];
  s->stadiumDescriptions[5]=1606;STADIUM[0]=(U)s->stadiumRows;STADIUM[2]=(U)s->stadiumDescriptions;s->layoutReady=1;
 }
 unsigned char count=s->signedIn?6:5;
 if(((unsigned char*)STADIUM)[12]!=count){
  // Retail cursors are allocated at menu creation. Rebuild the visual menu
  // when its row count changes, before its animation callback sees that count.
  U *heads=*(U**)0x804D782C;
  for(U object=heads[7];object;object=*(U*)(object+8)){
   unsigned char *data=*(unsigned char**)(object+0x2c);
   if(*(unsigned short*)object==6&&data&&data[0]==9){
    Text *description=*(Text**)(data+0xac);if(description)FREE(description);
    *(Text**)(data+0xac)=0;((void(*)(void*))0x80390228)((void*)object);break;
   }
  }
  if(!s->signedIn&&*(unsigned short*)0x804A04F2>4)*(unsigned short*)0x804A04F2=4;
  ((unsigned char*)STADIUM)[12]=count;
  ((void*(*)(int))0x8022B3A0)(0);s->dirty=1;
 }
}
static void restoreLayout(State*s){if(s->layoutReady){STADIUM[0]=s->originalRows;STADIUM[2]=s->originalDescriptions;((unsigned char*)STADIUM)[12]=5;s->layoutReady=0;}}
static int len(const char *p){int n=0;while(p[n]&&n<128)n++;return n;}
static void clearPassword(State*s){for(int i=0;i<132;i++)s->password[i]=0;}
static void request(State*s,U op){s->op=op;s->pendingTick=s->ticks;__asm__ volatile("sync":::"memory");s->req++;s->dirty=1;}
static void lineText(Text*t,int n,const char*p){
 // Native SIS expects Shift-JIS punctuation and has a 128-byte encoded buffer.
 char b[84];int out=0;
 for(int i=0;p[i]&&i<39;i++){
  unsigned char c=p[i],sj=0,hi=0x81;
  switch(c){case '>':sj=0x84;break;case '<':sj=0x83;break;case '/':sj=0x5e;break;case '_':sj=0x51;break;case '[':sj=0x6d;break;case ']':sj=0x6e;break;case '*':sj=0x96;break;case '?':sj=0x48;break;case '!':sj=0x49;break;case '@':sj=0x97;break;case '#':sj=0x94;break;case '(':sj=0x69;break;case ')':sj=0x6a;break;case '=':sj=0x81;break;case '+':sj=0x7b;break;case '%':sj=0x93;break;case '&':sj=0x95;break;case ';':sj=0x47;break;case '\\':sj=0x5f;break;case '^':sj=0x4f;break;case '|':sj=0x62;break;case '{':sj=0x6f;break;case '}':sj=0x70;break;case '~':sj=0x60;break;case '$':sj=0x90;break;case '`':sj=0x4d;break;}
  if(c>='a'&&c<='z'){hi=0x82;sj=c+0x20;}
  else if((c>='A'&&c<='Z')||(c>='0'&&c<='9')){hi=0x82;sj=c+0x1f;}
  else if(c==' ')sj=0x40;else if(c=='.')sj=0x44;else if(c==',')sj=0x43;else if(c==':')sj=0x46;else if(c=='-')sj=0x7c;else if(c=='"')sj=0x68;else if(c==39)sj=0x66;
  b[out++]=(char)hi;b[out++]=sj?sj:0x48;
 }b[out]=0;UPDATE(t,n,"%s",b);
}
static void line(State*s,int n,const char*p){lineText(s->text,n,p);}
static int online(State*s){return s->heartbeat&&s->ticks-s->heartbeatTick<300;}
static char keychar(State*s,int key){
 const char *keys=s->edit&&s->keypage?"!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~ ":
                  s->edit?"abcdefghijklmnopqrstuvwxyz0123456789_-. ":
                          "abcdefghijklmnopqrstuvwxyz0123456789_";
 if(key<0||key>=len(keys))return 0;
 char c=keys[key];
 return s->shift&&c>='a'&&c<='z'?c-'a'+'A':c;
}
static void render(State*s){
 char b[120];for(int i=0;i<20;i++)line(s,i,"");
 line(s,0,"CUSTOM MELEE BTT");
 FORMAT(b,"%s",s->signedIn?s->identity:"Not signed in");line(s,1,b);
 if(s->screen==0){s->text->hidden=1;s->dirty=0;return; }else if(s->screen==1){
  line(s,3,s->mode?"CREATE ACCOUNT":"SIGN IN");
  FORMAT(b,"%s Username: %.24s",s->selection==0?">":" ",s->username);line(s,5,b);
  char mask[33];int n=len(s->password);if(n>32)n=32;for(int i=0;i<n;i++)mask[i]='*';mask[n]=0;
  FORMAT(b,"%s Password: %s",s->selection==1?">":" ",mask);line(s,7,b);
  FORMAT(b,"%s %s",s->selection==2?">":" ",s->mode?"Create account":"Sign in");line(s,9,b);
  FORMAT(b,"%s %s",s->selection==3?">":" ",s->mode?"Use an existing account":"Create an account");line(s,11,b);
  line(s,14,"Username: 3-24 letters or numbers");line(s,15,"Password: 8-128 characters");
  line(s,17,"A  Select / Edit     B  Back");
 }else if(s->screen==2){
  line(s,3,s->edit?"PASSWORD":"USERNAME");
  char *v=s->edit?s->password:s->username;int n=len(v);
  if(s->edit){FORMAT(b,"%d characters",n);}else{FORMAT(b,"%s",v);}line(s,5,b);
  for(int r=0;r<4;r++){
   int out=0;for(int c=0;c<10;c++){int k=r*10+c;char ch=keychar(s,k);b[out++]=s->key==(U)k?'[':' ';b[out++]=ch?ch:' ';b[out++]=s->key==(U)k?']':' ';}b[out]=0;line(s,7+r,b);
  }
  line(s,12,s->shift?"L / R  Shift: ON  (ABC)":"L / R  Shift: OFF (abc)");
  if(s->edit)line(s,13,s->keypage?"Y  Letters and numbers":"Y  Symbols and Space");
  line(s,16,"A  Add character     X  Delete");line(s,17,"Start / B  Done");
 }else if(s->screen==3){
  FORMAT(b,"LEADERBOARD  -  %s",s->character==26?"Total time":characters[s->character%26]);line(s,3,b);
  for(U i=0;s->ack==s->req&&!s->status&&i<s->count&&i<10;i++){
   Row*r=&s->rows[i];U f=r->frames;
   FORMAT(b,"%s %3u  %-16.16s  %u:%02u.%02u",i==s->selection?">":" ",r->rank,r->name,f/3600,(f/60)%60,(f%60)*100/60);line(s,5+i,b);
  }
  if(!s->count&&s->ack==s->req&&!s->error[0])line(s,7,s->character==26?"Complete all 26 worlds to rank.":"No records yet.");
  line(s,16,"Left-Right: character   L-R: page");
  line(s,17,s->character==26?"X: Account   B: Back":"A: Replay   X: Account   B: Back");line(s,18,"Y: Refresh   Start: Total time");
 }else if(s->screen==4){
  line(s,4,"ACCOUNT");line(s,7,"A  Sign out");line(s,17,"B  Back");
 }else if(s->screen==5){
  line(s,4,"LOG IN");line(s,7,"Finish signing in in your browser.");
  line(s,9,"Your game will connect automatically.");
  line(s,16,"A  Open browser again");line(s,17,"B  Cancel");
 }else if(s->screen==6){
  line(s,4,"COMPANION");line(s,7,"Opening companion in your browser.");
  line(s,16,"A  Try again");line(s,17,"B  Back");
 }
 if(!online(s))line(s,19,"Offline - you can still play.");
 else if(s->ack!=s->req)line(s,19,s->op==4?"Opening replay...":"Loading...");
 else if(s->error[0]){FORMAT(b,"%.100s",s->error);line(s,19,b);}
 s->dirty=0;
}
__attribute__((section(".text.entry"))) int entry(int buttons,State*s){
 s->ticks++;layout(s);
 if(!s->text){
  if(!s->context)s->context=1+CONTEXT(0,*(void**)0x804D6BB0,7,8,0x80,7,0xff,0);
  s->text=NEW(0,s->context-1);
  s->text->x=-17.f;s->text->y=-12.f;s->text->z=16.f;s->text->w=1340.f;s->text->h=1100.f;
  s->text->sx=s->text->sy= .025f;s->text->hidden=1;s->text->bg=0x0a1224ff;s->text->color=0xf2f5fcff;s->text->depth=0;
  for(int i=0;i<20;i++)ADD(s->text,24.f,(float)(i*40+24)," ");
  s->dirty=1;
 }
 if(!s->identityText){
  Text*t=NEW(0,*(unsigned char*)0x804D6BB4);s->identityText=t;
  t->x=-12.5f;t->y=4.95f;t->z=17.f;t->sx=t->sy=.045f;t->kerning=1;
  ADD(t,0.f,0.f," ");
 }
 if(!s->companionText){
  Text*t=NEW(0,*(unsigned char*)0x804D6BB4);s->companionText=t;
  t->x=-12.5f;t->y=5.65f;t->z=17.f;t->sx=t->sy=.040f;t->kerning=1;ADD(t,0.f,0.f," ");
 }
 if(s->heartbeat!=s->lastHeartbeat){if(!online(s))s->dirty=1;s->lastHeartbeat=s->heartbeat;s->heartbeatTick=s->ticks;}
 if(s->ack!=s->lastAck){s->lastAck=s->ack;s->dirty=1;if(s->op==1||s->op==2){clearPassword(s);if(s->signedIn&&s->screen==1){s->screen=s->accountReturn;s->selection=0;}}}
 if(s->screen==6&&s->op==10&&s->ack==s->req&&!s->status){s->screen=0;s->dirty=1;}
 if(s->screen==5&&s->signedIn&&s->ack==s->req){s->screen=s->accountReturn;s->selection=0;s->dirty=1;}
 int busy=s->req!=s->ack&&s->ticks-s->pendingTick<1200;
 if(s->req==0&&online(s))request(s,6);
 if(buttons){s->dirty=1;
  if(s->screen==0){
   if((buttons&A)&&*(unsigned short*)0x804A04F2==3){s->screen=3;s->selection=0;s->offset=0;s->row=0;s->text->hidden=0;request(s,3);}
   else if((buttons&A)&&*(unsigned short*)0x804A04F2==4){s->accountReturn=0;s->screen=s->signedIn?4:5;s->selection=0;s->mode=0;s->text->hidden=0;if(!s->signedIn)request(s,7);}
   else if((buttons&A)&&*(unsigned short*)0x804A04F2==5&&s->signedIn){if(!busy){s->screen=6;request(s,10);}}
   else {if(buttons&(A|B)){restoreLayout(s);FREE(s->identityText);FREE(s->companionText);FREE(s->text);s->identityText=0;s->companionText=0;s->text=0;}return buttons;}
  }else if(s->screen==2){
   if(buttons&UP)s->key=(s->key+30)%40;if(buttons&DOWN)s->key=(s->key+10)%40;
   if(buttons&LEFT)s->key=(s->key+39)%40;if(buttons&RIGHT)s->key=(s->key+1)%40;
   if(buttons&(L|R))s->shift=!s->shift;
   if(s->edit&&(buttons&Y))s->keypage=!s->keypage;
   char *v=s->edit?s->password:s->username;int n=len(v),max=s->edit?128:24;
   if(buttons&X){if(n)v[n-1]=0;}
   if(buttons&0x200){char c=keychar(s,s->key);if(c&&n<max){v[n]=c;v[n+1]=0;}}
   if(buttons&(B|START)){s->screen=1;s->selection=s->edit;}
  }else if(s->screen==1){
   if(buttons&B){clearPassword(s);s->screen=s->accountReturn;s->selection=0;}
   else if(!busy||(s->op!=1&&s->op!=2)){
    if(buttons&UP)s->selection=(s->selection+3)%4;if(buttons&DOWN)s->selection=(s->selection+1)%4;
    if(buttons&A){
     if(s->selection<2){s->screen=2;s->edit=s->selection;s->key=0;s->keypage=0;s->shift=0;}
     else if(s->selection==3){s->mode=!s->mode;s->selection=0;clearPassword(s);}
     else request(s,s->mode?2:1);
    }
   }
  }else if(s->screen==3){
   if(buttons&B){s->screen=0;s->text->hidden=1;s->selection=0;}
   else if(buttons&X){s->accountReturn=3;s->screen=s->signedIn?4:5;s->selection=0;if(!s->signedIn)request(s,7);}
   else if(buttons&(LEFT|RIGHT|START)){
    s->character=buttons&START?26:(s->character+(buttons&LEFT?26:1))%27;
    s->offset=0;s->selection=0;s->row=0;request(s,3);
   }else if(buttons&Y){s->row=1;request(s,3);}
   else if(!busy&&s->ack==s->req&&!s->status){
    if(buttons&(L|R)){if(buttons&L)s->offset=s->offset>=10?s->offset-10:0;else if(s->offset+10<s->total)s->offset+=10;s->selection=0;s->row=0;request(s,3);}
    else if(s->count){if(buttons&UP)s->selection=(s->selection+s->count-1)%s->count;if(buttons&DOWN)s->selection=(s->selection+1)%s->count;if((buttons&A)&&s->character!=26){s->row=s->selection;request(s,4);}}
   }
  }else if(s->screen==4){if(buttons&B){s->screen=s->accountReturn;s->selection=0;}else if((buttons&A)&&!busy){request(s,5);s->screen=s->accountReturn;s->selection=0;s->username[0]=0;clearPassword(s);}}
  else if(s->screen==6){if(buttons&B){s->screen=0;s->dirty=1;}else if((buttons&A)&&!busy)request(s,10);}
  else if(s->screen==5){
   if(buttons&B){request(s,9);s->screen=s->accountReturn;s->selection=0;}
   else if((buttons&A)&&!busy)request(s,7);
  }
 }
 if(s->screen==5&&s->ack==s->req&&!s->status&&online(s)&&s->ticks-s->pendingTick>=120)request(s,8);
 s->companionText->hidden=s->screen!=0||!s->signedIn;
 if(!s->companionText->hidden){U color=*(unsigned short*)0x804A04F2==5?0x111111ff:0xffcc33ff;if(s->dirty||s->ticks%60==1){lineText(s->companionText,0,"Companion");COLOR(s->companionText,0,&color);}}
 s->identityText->hidden=s->screen!=0;
 if(s->screen==0){
  char name[60];FORMAT(name,s->signedIn?"Logged as %.24s":"Log in",s->identity);
  int n=len(name);float scale=s->signedIn?(n>14?.030f*14.f/(float)n:.030f):.040f;
  s->identityText->y=s->signedIn?3.25f:4.95f;
  s->identityText->sx=s->identityText->sy=scale;
  U color=*(unsigned short*)0x804A04F2==4?0x111111ff:0xffcc33ff;
  if(s->dirty||s->ticks%60==1){lineText(s->identityText,0,name);COLOR(s->identityText,0,&color);}
 }
 s->text->hidden=s->screen==0;
 if(s->dirty||s->ticks%120==0)render(s);
 return 0;
}
