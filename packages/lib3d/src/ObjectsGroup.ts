import isEqual from "lodash.isequal";
import * as THREE from "three";
import Object3D from "./Object3D";
import ObjectsCommon, { IObjectsCommonJSON } from "./ObjectsCommon";
import Scene from "./Scene";

import cloneDeep from "lodash.clonedeep";
import Union from "./Union";
import RepetitionObject from "./RepetitionObject";

export interface IObjectsGroupJSON extends IObjectsCommonJSON {
  children: IObjectsCommonJSON[];
}

export default class ObjectsGroup extends ObjectsCommon {
  public static typeName: string = "ObjectsGroup";

  /**
   *
   * @param object the object descriptor of the group
   * @param scene the scene to which the object belongs
   */
  public static newFromJSON(object: IObjectsGroupJSON, scene: Scene) {
    if (object.type !== ObjectsGroup.typeName) {
      throw new Error(
        `Types do not match ${ObjectsGroup.typeName}, ${object.type}`
      );
    }
    try {
      const group: ObjectsCommon[] = object.children.map(obj =>
        scene.getObject(obj)
      );
      return new ObjectsGroup(group);
    } catch (e) {
      throw new Error(`Cannot create ObjectsGroup. ${e}`);
    }
  }

  private children: ObjectsCommon[];

  constructor(children: ObjectsCommon[] = [], mesh?: THREE.Group | undefined) {
    super(ObjectsCommon.createViewOptions(), []);
    this.children = children;
    this.children.forEach(child => child.setParent(this));
    this.type = ObjectsGroup.typeName;
    this.mesh = new THREE.Group();
    this.meshPromise = null;
    this.lastJSON = this.toJSON();
    if (mesh) {
      this.setMesh(mesh);
    } else {
      this.meshPromise = this.computeMeshAsync();
    }
  }
  public getChildren(): ObjectsCommon[] {
    return this.children;
  }

  public add(object: Object3D): void {
    this.children.push(object);
  }

  public toUnion(): Union {
    const unionChildren: Object3D[] = [];
    this.children.forEach(child => {
      if (child instanceof Object3D) {
        unionChildren.push(child);
      } else if (child instanceof RepetitionObject) {
        unionChildren.push(child.toUnion());
      } else if (child instanceof ObjectsGroup) {
        unionChildren.push(child.toUnion());
      }
    });
    return new Union(unionChildren);
  }
  public async computeMeshAsync(): Promise<THREE.Group> {
    // Operations must be applied to the single objects, but they are not transferred whilst they are grouped.
    if (this.children.length === 0) {
      throw new Error("No item in group");
    }
    this.meshPromise = new Promise(async (resolve, reject) => {
      try {
        this.mesh = new THREE.Group();

        const promises: Array<Promise<THREE.Object3D>> = this.children.map(
          object3D => {
            const objectClone = object3D.clone();
            const json = objectClone.toJSON();
            json.operations = json.operations.concat(this.operations);
            objectClone.updateFromJSON(json);
            return objectClone.getMeshAsync();
          }
        );

        const meshes = await Promise.all(promises);

        meshes.forEach(mesh => {
          this.mesh.add(mesh);
        });

        resolve(this.mesh);
      } catch (e) {
        reject(e);
      }
    });
    return this.meshPromise as Promise<THREE.Group>;
  }

  // When a group is un-grouped all the operations of the group are transferred to the single objects
  // Return the array of objects with all the inherited operations of the group.
  public unGroup(): ObjectsCommon[] {
    this.children.forEach(object3D => {
      const json = object3D.toJSON();
      json.operations = json.operations.concat(this.operations);
      object3D.updateFromJSON(json);
    });
    return this.children;
  }

  public clone(): ObjectsGroup {
    const groupClone = this.children.map(obj2clone => obj2clone.clone());
    const obj = new ObjectsGroup(groupClone);
    obj.setOperations(this.operations);
    return obj;
  }

  public toJSON(): IObjectsGroupJSON {
    const obj: IObjectsGroupJSON = {
      ...super.toJSON(),
      children: this.children.map(obj2JSON => obj2JSON.toJSON())
    };

    return cloneDeep(obj);
  }

  /**
   * Updates objects belonging to a group. Group members cannot be changed.
   * If group members do not match an Error is thrown
   * @param object ObjectGroup descriptor object
   */
  public updateFromJSON(object: IObjectsGroupJSON) {
    if (object.id !== this.id) {
      throw new Error(`ids do not match ${object.id}, ${this.id}`);
    }

    const newChildren: ObjectsCommon[] = [];
    try {
      object.children.forEach(obj => {
        const objToUpdate = this.getChild(obj);
        objToUpdate.updateFromJSON(obj);
        newChildren.push(objToUpdate);
      });

      if (!isEqual(newChildren, this.children)) {
        this.children = newChildren.slice(0);
        this._meshUpdateRequired = true;
      }

      const vO = {
        ...ObjectsCommon.createViewOptions(),
        ...object.viewOptions
      };
      this.setOperations(object.operations);
      this.setViewOptions(vO);

      if (!isEqual(this.lastJSON, this.toJSON())) {
        this.lastJSON = this.toJSON();
        this.meshPromise = this.computeMeshAsync();
        let obj: ObjectsCommon | undefined = this.getParent();
        while (obj) {
          obj.meshUpdateRequired = true;
          obj.computeMeshAsync();
          obj = obj.getParent();
        }
      }
    } catch (e) {
      throw new Error(`Cannot update Group: ${e}`);
    }
  }

  protected clean(): void {
    this.children.length = 0;
  }

  private setMesh(mesh: THREE.Group): void {
    this.mesh = mesh;
    this._meshUpdateRequired = false;
    this._pendingOperation = false;
    this.mesh.updateMatrixWorld(true);
    this.mesh.updateMatrix();
  }

  /**
   * Returns Object Reference if found in group. If not, throws Error.
   * @param obj Object descriptor
   */
  private getChild(obj: IObjectsCommonJSON): ObjectsCommon {
    const result = this.children.find(object => object.getID() === obj.id);
    if (result) {
      return result;
    }
    throw new Error(`Object id ${obj.id} not found in group`);
  }
}