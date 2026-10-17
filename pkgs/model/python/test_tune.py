"""Backend equivalence, durable telemetry, and exact epoch-resume checks."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import torch

import tune
from progress import Progress


class TuningTests(unittest.TestCase):
    def test_dilated_kernel_equivalence_double_precision(self):
        torch.manual_seed(5)
        architecture = dict(tune.DEEP, embedding=4, channels=6, hidden=8, nearest=4, contextualNearest=4)
        native = tune.ContextCNN(32, architecture).double().eval()
        expanded = tune.ContextCNN(32, architecture, "expanded").double().eval()
        expanded.load_state_dict(native.state_dict())
        x = torch.randint(0,32,(3,32))
        a, b = native(x), expanded(x)
        torch.testing.assert_close(a,b,atol=1e-12,rtol=1e-10)
        a.mean().backward(); b.mean().backward()
        for p,q in zip(native.parameters(),expanded.parameters()):
            torch.testing.assert_close(p.grad,q.grad,atol=1e-12,rtol=1e-10)

    def test_telemetry_is_append_only_and_status_is_latest(self):
        with tempfile.TemporaryDirectory() as directory:
            log = Progress(directory,60)
            try:
                log.phase("train",run="test",epoch=1)
                log.emit("train-progress",batch=2,trainingLoss=.3)
                state=json.loads((Path(directory)/"status.json").read_text())
                self.assertEqual(state["phase"],"train")
                self.assertEqual(state["batch"],2)
                self.assertEqual(len((Path(directory)/"events.jsonl").read_text().splitlines()),2)
            finally:
                log.close()

    @unittest.skipUnless(torch.cuda.is_available(),"GPU resume integration")
    def test_interrupted_epoch_replays_from_full_training_state(self):
        torch.set_num_threads(2)
        torch.cuda.set_device(0)
        torch.manual_seed(8)
        x=torch.randint(0,512,(32,64),device="cuda",dtype=torch.int32)
        y=torch.randint(0,2,(32,),device="cuda").float()
        val_x=x[:16]; val_y=y[:16].cpu().numpy().astype(np.uint8)
        manifest=dict(tokenizer=dict(vocabulary=512),tokensPerSide=32,corpus=dict(context=5),corpusManifestHash="synthetic")
        spec=dict(name="fixture",architecture=dict(tune.BASE),weightDecay=1e-4)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            args=SimpleNamespace(out=root/"full",resume=False,conv_backend="expanded",batch_size=8,epochs=2,log_seconds=60)
            args.out.mkdir()
            tune.LOG=Progress(root,60)
            try:
                full,_=tune.fit(spec,42,args,manifest,"synthetic",x,y,val_x,val_y)
                expected=torch.load(full/"best.pt",weights_only=True)
                args.out=root/"resumed";args.out.mkdir()
                original=tune.predictions
                calls=0
                def interrupt(*a,**kw):
                    nonlocal calls
                    calls+=1
                    if calls==2: raise KeyboardInterrupt("simulated interruption during epoch 2")
                    return original(*a,**kw)
                with patch.object(tune,"predictions",interrupt):
                    with self.assertRaises(KeyboardInterrupt):
                        tune.fit(spec,42,args,manifest,"synthetic",x,y,val_x,val_y)
                args.resume=True
                resumed,_=tune.fit(spec,42,args,manifest,"synthetic",x,y,val_x,val_y)
                actual=torch.load(resumed/"best.pt",weights_only=True)
                for key in expected:
                    torch.testing.assert_close(actual[key],expected[key],atol=1e-7,rtol=1e-6)
                np.testing.assert_allclose(np.load(full/"validation-scores.npy"),np.load(resumed/"validation-scores.npy"),atol=1e-7)
            finally:
                tune.LOG.close();tune.LOG=None


if __name__=="__main__":
    unittest.main()
