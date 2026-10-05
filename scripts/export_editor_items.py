"""Export the original Warp Star model for every editor world scale."""
import json,struct,math
from editor_model_assets import OUT,ROOT
from export_editor_actors import joint_parts,shade_preview
import native_encounters as retail

def main():
    retail.load(ROOT/'Super Smash Bros. Melee (USA) (En,Ja) (v1.02).iso')
    d=retail.SOURCES['ItCo.usd'].d
    article=d.u(d.u(d.roots['itPublicData']+4)+29*4)
    native_scale=struct.unpack_from('>f',d.data,d.u(article)+0x60)[0]
    print('Warp Star native scale:',native_scale)
    catalog=json.loads((OUT/'actors.json').read_text())
    for entry in json.loads((OUT.parent/'catalog.json').read_text()):
        suffix=entry['stage'];scale=json.loads((OUT.parent/(suffix+'.json')).read_text())['scale']
        model=joint_parts(d,d.u(d.u(article+16)))
        shade_preview(model,math.pi/2)
        for part in model:
            for v in part['vertices']:v[:3]=[round(float(n*native_scale/scale),6) for n in v[:3]]
        name=f'{suffix}-actor-29.json'
        (OUT/name).write_text(json.dumps(dict(poses=[model],period=120),separators=(',',':')))
        catalog.setdefault(suffix,{})['29']='/editor/data/models/'+name
    (OUT/'actors.json').write_text(json.dumps(catalog))
if __name__=='__main__':main()
