/**
 * Copyright (c) 2018 Bitbloq (BQ)
 *
 * License: MIT
 *
 * long description for the file
 *
 * @summary short description for the file
 * @author David García <https://github.com/empoalp>, Alberto Valero <https://github.com/avalero>
 *
 * Created at     : 2018-10-02 19:16:51 
 * Last modified  : 2018-10-10 19:10:44
 */

import * as THREE from 'three';
import {OperationsArray, Object3D} from './Object3D';

interface ICylinderParams extends ICommonGeometryParamas{
  r0:number,
  r1:number,
  height:number
}

export default class Cylinder extends Object3D{

  public static typeName:string = 'Cylinder';

  private parameters: ICylinderParams;
  
  constructor(parameters: ICylinderParams, operations: OperationsArray = []){
    super(operations);
    this.parameters = {...parameters};
    this._updateRequired = true;
    this.mesh = this.getMesh();    
  }

  protected setParameters(parameters: ICylinderParams): void{
    if(parameters !== this.parameters){
      this._updateRequired = true;
      this.parameters = {...parameters};
    }
  }

  protected getGeometry(): THREE.Geometry {
    const {r0,r1,height} = this.parameters;
    this._updateRequired = false;
    return new THREE.CylinderGeometry(Number(r1), Number(r0), Number(height), 32, 1).rotateX(Math.PI/2);
  }


}