"""Distinct roster encounters using retail actors or authored props.

Ness, Ice Climbers and Sheik use native actor AI through native_encounters.
Other props use authored motion; Zapdos keeps its original animated skeleton.
"""
from native_props import specification
from world_gameplay import ride,gate,patrol,orbit,arc,teleport,TARGET_PATTERNS,IDENTITIES

ROSTER=('Ic','Kb','Ms','Mt','Ns','Pc','Pk','Pr','Ss','Sk','Zd','Gw','Fe')


def prop(name,asset,x,y,w,kind='bumper',**motion):
    h=w*specification(asset)['aspect'];orbiting=motion.pop('orbit',False);m=ride(name,x,y,w,**motion)
    m['orbit']=orbiting
    m.update(kind=kind,nativeProp=asset,height=h,damage=8,growth=85,baseKnockback=45,element=0,
        outline=[(w*.2,0),(w*.8,0),(w,-h*.2),(w,-h*.8),(w*.8,-h),(w*.2,-h),(0,-h*.8),(0,-h*.2)])
    if kind=='decoration':m['visualDepth']=-24-w*specification(asset)['depth']/2
    return m


def grounded(name,asset,left,top,w,**motion):
    return prop(name,asset,left,top+w*specification(asset)['aspect'],w,**motion)


def pulse(m,period,start,end):
    m.update(period=period,blink=[(0,0),(start,1),(end,0),(period,0)])
    return m


def configure(a):
    s=a.suffix
    if s not in ROSTER:return
    f=a.authored_surfaces
    if s=='Ic':
        # Alternating narrow floes give a recovery route, while the summit
        # patrol makes the last landing a timing problem instead of another step.
        a.mechanisms[0].update(width=28,dx=78,period=290,hold=22)
        a.mechanisms[1].update(width=24,dx=-64,dy=40,period=390,hold=35)
        a.mechanisms[2].update(width=26,dx=122,period=455,hold=12)
        TARGET_PATTERNS[s]=[patrol(3,-22,0,260)]
        IDENTITIES[s]='A vertical ice ascent with three narrow slippery floes. Pass two native Topis and the summit polar bear, then spend the second jump on the outside hammer targets.'
    elif s=='Kb':
        # No safety floor or Whispy. Two clouds are the only mobile refills.
        a.mechanisms[0].update(period=330,dx=108,dy=74,width=30)
        a.mechanisms[1].update(period=510,dx=70,dy=52,width=24)
        TARGET_PATTERNS[s]=[arc(0,-18,10,360),orbit(2,-20,10,420),orbit(4,22,5,540),orbit(7,18,10,390)]
        IDENTITIES[s]='Four fixed dream ledges and two moving clouds above open sky. Budget aerial jumps between the lower launch island, moving clouds and the crown; there is no safety floor beneath the route.'
    elif s=='Ms':
        # Move the bridge from the solid courtyard floor to the real roof gap.
        a.mechanisms[0].update(name='West tower drawbridge',x=-178,y=f[9][2],width=52,
            keepAnchor=True,angle=78,period=430,hold=95)
        a.mechanisms[1].update(name='Keep portcullis',x=-93,y=f[9][2]+58,height=58,
            dy=64,period=460,hold=100)
        statue=grounded('Altean hero monument','marth-statue',-14,f[10][2],24,kind='decoration')
        a.mechanisms.append(statue)
        TARGET_PATTERNS[s]=[]
        IDENTITIES[s]='A sword route through the castle: exterior ascent, a drawbridge across the actual roof gap, then an opening portcullis. Fixed targets reward reaching through gaps with the sword tip.'
    elif s=='Mt':
        # Two shutter directions divide the compact lab. Mew crosses through
        # them harmlessly and marks the safe aerial side of the containment ring.
        a.mechanisms=[gate('Lower containment shutter',-64,77,12,45,61,period=360,hold=50),
                      gate('Upper containment shutter',72,153,12,42,-51,period=470,hold=65),
                      prop('Escaping Mew','mew',-108,158,22,kind='decoration',dx=184,dy=47,period=510,hold=0,orbit=True)]
        TARGET_PATTERNS[s]=[teleport(0,[(28,10)],[140,220]),teleport(2,[(22,24),(55,3)],[100,170,210]),
            teleport(3,[(35,18)],[220,160]),orbit(5,28,10,360),teleport(7,[(35,-12),(-32,-8)],[180,120,150])]
        IDENTITIES[s]='Compact containment cells with two independently sliding shutters. Attack before Teleport, reappear beyond the obstruction, and choose which disappearing target to intercept next.'
    elif s=='Ns':
        # native_encounters hosts full original Onett cars, including hits.
        # The lift is gone: the high island requires an aerial recovery.
        a.mechanisms=[]
        TARGET_PATTERNS[s]=[]
        IDENTITIES[s]='An Onett street crossing beneath a rooftop detour. Dodge complete native Onett traffic racing from beyond the right boundary to beyond the left. Guide PK Thunder into roof pockets and use PK Thunder 2 to reach the suspended crossing.'
    elif s=='Pc':
        a.mechanisms=[m for m in a.mechanisms if m['kind']!='electric']
        ball=grounded('Electrode discharge','electrode',92,f[5][2],26,period=300,hold=0)
        ball.update(damage=13,growth=115,baseKnockback=62,element=2,
            xKeys=[(0,92),(95,92),(120,123),(155,123),(220,92),(300,92)])
        a.mechanisms.append(ball)
        a.mechanisms[0].update(width=19,period=270,blink=[(0,1),(90,0),(200,1),(270,1)])
        TARGET_PATTERNS[s]=[teleport(2,[(24,16)],[210,120]),patrol(4,26,0,390),teleport(6,[(-22,18)],[150,240])]
        IDENTITIES[s]='A small battery maze: short precision jumps, an intermittent contact ledge, and a rolling Electrode guarding the eastern casing. Save Agility for two sharp recovery angles.'
    elif s=='Pk':
        a.mechanisms=[m for m in a.mechanisms if m['kind']!='electric']
        bird=prop('Zapdos generator pass','zapdos',-186,193,43,dx=292,period=480,hold=0)
        bird.update(nativeAnimation='zapdos',xKeys=[(0,-186),(125,-186),(255,106),(400,106),(480,-186)],
                    yKeys=[(0,193),(125,193),(190,244),(255,193),(400,193),(440,244),(480,193)],
                    damage=11,element=2,baseKnockback=60)
        a.mechanisms.append(bird)
        a.mechanisms[0].update(width=24,period=390,hold=35)
        TARGET_PATTERNS[s]=[patrol(3,-22,0,240),patrol(4,28,0,480),teleport(6,[(22,24)],[180,270])]
        IDENTITIES[s]='A tall generator climb split by a solid central core. Cross the crown between Zapdos passes, line up Thunder above the roof, then bend Quick Attack around the outside coils.'
    elif s=='Pr':
        # Peaceful moving actors are landing points, not damaging Pokémon.
        # Low, far-out balloons trade several jumps for a refill outside the spiral.
        a.mechanisms=[prop('Western Clefairy balloon','clefairy',-183,112,26,kind='platform',dy=55,period=500,hold=70),
                      prop('Eastern Clefairy balloon','clefairy',144,205,22,kind='platform',dy=57,period=610,hold=80)]
        for m in a.mechanisms:m['floorOutline']=[(m['width']*.3,-m['height']*.08),(m['width']*.7,-m['height']*.08)]
        TARGET_PATTERNS[s]=[arc(0,-16,8,480),patrol(2,22,0,620),arc(5,22,12,720),orbit(7,-18,8,590)]
        IDENTITIES[s]='A long aerial recital with two tiny Clefairy landings outside the spiral. Budget the aerial jumps for low detours and use the slow balloons to refill before the final high pair.'
    elif s=='Ss':
        # Metroids patrol separate horizontal cave rooms. Ceiling geometry
        # forces missiles and aerials through the real openings between shelves.
        for name,x,y,dx,period in [('Lower Metroid',-115,77,190,190),('Upper Metroid',35,252,-115,250)]:
            m=prop(name,'metroid',x,y,22,dx=dx,dy=17 if dx>0 else -24,period=period,hold=0,orbit=True)
            m.update(damage=9,growth=75,baseKnockback=45);a.mechanisms.append(m)
        TARGET_PATTERNS[s]=[patrol(7,32,0,420),teleport(9,[(26,8)],[300,180])]
        IDENTITIES[s]='Three solid cave chambers with opposite entrances. Thread missiles past two patrolling Metroids, reverse underneath the ceilings, and recover through the lift shaft.'
    elif s=='Sk':
        a.mechanisms=[m for m in a.mechanisms if m['kind']!='bumper']
        TARGET_PATTERNS[s]=[teleport(1,[(-22,-4)],[210,180]),teleport(3,[(-26,18)],[180,250]),
            teleport(5,[(-16,18),(24,8)],[170,130,210]),teleport(9,[(-26,0)],[180,260])]
        IDENTITIES[s]='A narrow Shadow Temple ascent with two ReDead sentries on alternating landings. Needles reach past them; Vanish and opposite-phase shadow steps let you skip exposed landings.'
    elif s=='Zd':
        # The three visible paths share a song-length cycle, with a clear pause
        # between phrases. Zelda must commit across or teleport through a gap.
        for i,m in enumerate(a.mechanisms):
            start=i*110;end=start+190
            m.update(period=550,width=27,blink=[(0,1 if start==0 else 0)]+([] if start==0 else [(start,1)])+[(end,0),(550,1 if start==0 else 0)])
        instrument=grounded('Ocarina of Time altar','ocarina',-9.5,f[8][2],19,kind='decoration')
        a.mechanisms.append(instrument)
        TARGET_PATTERNS[s]=[teleport(0,[(25,12)],[220,330]),orbit(5,30,12,550),teleport(6,[(-28,15)],[330,220])]
        IDENTITIES[s]='A Temple of Time crossing built around three sequential light bridges and an Ocarina altar. Follow the phrase, use a long Din’s Fire shot, or commit to Farore’s Wind between the islands.'
    elif s=='Gw':
        tool=prop('Flat Zone falling tool','flat-tool',-70,218,17,period=310,hold=0)
        tool.update(yKeys=[(0,218),(100,218),(150,65),(205,-80),(309,-80),(310,218)],
                    blink=[(0,0),(75,1),(205,0),(310,0)],damage=9,baseKnockback=48)
        a.mechanisms.append(tool)
        a.mechanisms[0].update(period=265,hold=18,width=33)
        a.mechanisms[1].update(period=430,hold=55,width=29)
        TARGET_PATTERNS[s]=[arc(4,70,36,300),arc(5,74,25,420),arc(8,-26,26,360)]
        IDENTITIES[s]='Fire rescue meets Flat Zone: two independently moving rescue teams launch different arcs while original falling tools interrupt the climb. The final drop ends on the ambulance side.'
    elif s=='Fe':
        # The original Binding Blade is a suspended siege obstacle, striking
        # the approach to the inner stair in a short burst then withdrawing.
        blade=prop('Binding Blade siege sweep','binding-blade',-103,162,54,period=340,hold=0)
        blade.update(xKeys=[(0,-103),(125,-103),(145,-47),(195,-47),(255,-103),(340,-103)],
            yKeys=[(0,170),(125,170),(145,157),(195,157),(255,170),(340,170)],
            damage=15,growth=100,baseKnockback=65,element=1)
        a.mechanisms.append(blade)
        a.mechanisms[0].update(name='Siege entry bridge',period=290,hold=50,width=68)
        TARGET_PATTERNS[s]=[patrol(6,25,0,420)]
        IDENTITIES[s]='An asymmetric siege ascent: two flame windows below and the original Binding Blade sweeping across the inner stair. Get close for Roy’s inner hit, then leave the east rampart with Blazer in reserve.'
    a.native_source_elements=[dict(name=m['name'],asset=m['nativeProp'],archive='ItCo.usd' if m.get('nativeAnimation') else specification(m['nativeProp'])['sourceArchive']) for m in a.mechanisms if m.get('nativeProp')]

    if s in ('Ns','Ic','Sk'):
        sources={'Ns':[('Onett native traffic','GrOt.dat')],'Ic':[('Topi native enemies','ItCo.usd'),('Polar bear native enemy','GrIm.dat')],'Sk':[('Adventure ReDead enemies','ItCo.usd')]}
        a.native_source_elements=[dict(name=n,archive=archive,implementation='retail actor AI and animations') for n,archive in sources[s]]
