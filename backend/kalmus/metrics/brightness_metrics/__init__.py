import importlib
import pkgutil
import os

package_dir = os.path.dirname(__file__)

skip_modules = {"BrightBrightnessMetric"}

for _, module_name, _ in pkgutil.iter_modules([package_dir]):
    if module_name not in skip_modules:
      importlib.import_module(f"{__name__}.{module_name}")
