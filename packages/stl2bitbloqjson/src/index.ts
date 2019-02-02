import 'jsdom-worker';

import { STLObject } from '@bitbloq/lib3d';
import * as fs from 'fs';

interface ISTLParams {
  blob: {
    uint8Data: Uint8Array;
    filetype: string;
    newfile: boolean;
  };
}

const stlFolder = './stl';
const jsonFolder = './json';

fs.readdirSync(stlFolder).forEach(async file => {
  console.log(`Converting ${file} ...`);

  try {
    const blob: ArrayBuffer = fs.readFileSync(`${stlFolder}/${file}`);
    const uint8Data: Uint8Array = new Uint8Array(blob);

    const parameters: ISTLParams = {
      blob: {
        uint8Data,
        filetype: 'model/x.stl-binary',
        newfile: true,
      },
    };

    const stlObject: STLObject = new STLObject(parameters);
    await stlObject.computeMeshAsync();
    const json = stlObject.toJSON();
    json.id = '';
    delete json.viewOptions;
    const jsonFileName: string = `${file.substr(0, file.length - 3)}json`;
    console.log(`${jsonFolder}/${jsonFileName}`);
    fs.writeFileSync(`${jsonFolder}/${jsonFileName}`, JSON.stringify(json));
    console.log(JSON.stringify(json));
    console.log('Done!');
  } catch (e) {
    console.error(e);
  }
});
