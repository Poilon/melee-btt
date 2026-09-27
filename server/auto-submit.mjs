import { inspectReplay } from '../shared/replay.mjs';

export class AutoSubmitter {
  constructor({store,replays,remote,challenge,gecko,getIdentity}) { Object.assign(this,{store,replays,remote,challenge,gecko,getIdentity}); }
  async sync() {
    if(this.running)return;this.running=true;
    try {
      const identity=await this.getIdentity();
      if(!identity||!this.remote.status(identity).paired||this.remote.status(identity).competition?.phase==='closed')return;
      for(const run of this.store.bestRuns(this.challenge.id,identity.id)) {
        if(!run.hasReplay||run.submissionStatus!=='local')continue;
        const saved=this.store.replay(run.id);if(!saved)continue;
        try {
          const bytes=await this.replays.savedBytes(saved.sha256),details=inspectReplay(bytes,run,this.gecko);
          if(details.pauseFrames>0){this.store.exclude(run.id,'Paused during the run. Excluded from records and submissions.');continue;}
          if(details.gameEndMethod!==6)continue;
          if((await this.getIdentity())?.id!==identity.id)return;
          const current=this.store.bestRuns(this.challenge.id,identity.id).find(r=>r.character===run.character);
          if(current?.id!==run.id||current.submissionStatus!=='local')continue;
          await this.remote.enqueue({...run,identity,challenge:this.challenge},bytes,saved.name);
        } catch { this.store.setSubmission(run.id,'upload-error','Automatic upload failed. Retry from this run.'); }
      }
    } finally {this.running=false;}
  }
}
