export const peachItems = ['random', 'turnip', 'beam-sword', 'bob-omb', 'mr-saturn'];
export const defaultPlaySettings = () => ({music:true, rumble:true, ucf:true, iceClimbers:false, luigiMisfire:false, peachItems:Array(10).fill('random')});
export function validPlaySettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.music !== 'boolean' || typeof value.rumble !== 'boolean') return false;
  const keys=Object.keys(value);
  // v0.5 files and already-open browser tabs only contain music and rumble.
  if(keys.length===2)return true;
  return keys.length===6 && ['ucf','iceClimbers','luigiMisfire'].every(key=>typeof value[key]==='boolean') &&
    Array.isArray(value.peachItems) && value.peachItems.length===10 && value.peachItems.every(item=>peachItems.includes(item));
}
export function normalizePlaySettings(value, base=defaultPlaySettings()) {
  if(!validPlaySettings(value))throw new Error('Invalid play settings.');
  return {...base,...value,peachItems:[...(value.peachItems||base.peachItems)]};
}
