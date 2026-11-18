"""Bundle the two vendored Three.js modules without a Node/npm dependency.

The modules are enclosed separately to preserve lexical scope. Only their
explicit static import/export statements are converted; their code is intact.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent

def names(text):
    pairs = []
    for item in text.split(','):
        words = item.strip().split()
        if not words:
            continue
        assert len(words) == 1 or (len(words) == 3 and words[1] == 'as')
        pairs.append((words[0], words[-1]))
    return pairs

def office_bundle():
    core = (ROOT/'src/vendor/three.core.js').read_text()
    module = (ROOT/'src/vendor/three.module.js').read_text()
    scene = (ROOT/'src/office-scene.js').read_text()
    exported = re.findall(r'^export \{([^}]+)\};\s*$', core, re.M)
    assert len(exported) == 1
    core = re.sub(r'^export \{[^}]+\};\s*$', '', core, flags=re.M)
    core_exports = ','.join(f'{alias}:{original}' for original, alias in names(exported[0]))
    imports = re.findall(r"^import \{([^}]+)\} from './three.core.js';", module, re.M)
    reexports = re.findall(r"^export \{([^}]+)\} from './three.core.js';", module, re.M)
    localexports = re.findall(r'^export \{([^}]+)\};\s*$', module, re.M)
    assert len(imports) == len(reexports) == len(localexports) == 1
    module = re.sub(r"^(?:import|export) \{[^}]+\} from './three.core.js';", '', module, flags=re.M)
    module = re.sub(r'^export \{[^}]+\};\s*$', '', module, flags=re.M)
    destructure = ','.join(f'{original}:{alias}' for original, alias in names(imports[0]))
    exports = {alias: f'core.{original}' for original, alias in names(reexports[0])}
    exports.update({alias: original for original, alias in names(localexports[0])})
    assert scene.count("import * as THREE from './vendor/three.module.js';") == 1
    scene = scene.replace("import * as THREE from './vendor/three.module.js';", '')
    scene = scene.replace('export class Office3D', 'class Office3D', 1)
    assert not re.search(r'^\s*(import|export)\s', core+module+scene, re.M)
    result = ('/* Three.js MIT license is included in src/vendor/three-LICENSE.txt. */\n'
              'globalThis.TVSOfficeScene=(()=>{\nconst core=(()=>{\n'+core+'\nreturn {'+core_exports+'};\n})();\n'
              'const THREE=(()=>{\nconst {'+destructure+'}=core;\n'+module+'\nreturn {'+
              ','.join(f'{key}:{value}' for key,value in exports.items())+'};\n})();\n'+scene+'\nreturn Office3D;\n})();')
    return result.replace('</script', '<\\/script')
