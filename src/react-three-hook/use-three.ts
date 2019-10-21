import { useContext, useEffect, useRef } from "react";
import { ThreeJSContext, IThreeContext } from "./threejs-manager";
import * as THREE from "three";

type ISetupFn<T extends THREE.Object3D | void> = (context: IThreeContext) => T;
type IDestroyFn<T extends THREE.Object3D | void> = (context: IThreeContext, entity?: T) => void;

export const useThree = <T extends THREE.Object3D | void>(setup: ISetupFn<T>, destroy?: IDestroyFn<T>) => {
  const entityRef = useRef<T>();
  const context = useContext(ThreeJSContext);

  const getEntity = () => entityRef.current;

  useEffect(() => {
    entityRef.current = setup(context);

    return () => {
      const entity = getEntity();
      if (destroy) {
        return destroy(context, entity);
      }
      if (entity) {
        context.scene.remove(entity as THREE.Object3D);
      }
    };
  }, []);

  return {
    getEntity,
    ...context,
  };
};
