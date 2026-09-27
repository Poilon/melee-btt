// External Melee character IDs used by game setup and Slippi recordings.
// Zelda/Sheik share one challenge entry; solo Popo shares Ice Climbers' entry.
const externalCharacters = {
  22:'dr-mario',8:'mario',7:'luigi',5:'bowser',12:'peach',17:'yoshi',1:'donkey-kong',
  0:'captain-falcon',25:'ganondorf',20:'falco',2:'fox',11:'ness',14:'ice-climbers',32:'ice-climbers',
  4:'kirby',16:'samus',18:'zelda',19:'zelda',6:'link',21:'young-link',24:'pichu',13:'pikachu',
  15:'jigglypuff',10:'mewtwo',3:'game-and-watch',9:'marth',23:'roy',
};
export const characterForExternalId = id => Object.hasOwn(externalCharacters,id) ? externalCharacters[id] : null;
