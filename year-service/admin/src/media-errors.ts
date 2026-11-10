export class UploadProblem extends Error {
  constructor(public status:number,message:string){super(message);}
}
