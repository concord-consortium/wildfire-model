import { observable } from "mobx";
import { urlConfigWithDefaultValues } from "../config";

export class UIModel {
  @observable public view = urlConfigWithDefaultValues.view;
  @observable public sparkPositionInteraction = false;
}
