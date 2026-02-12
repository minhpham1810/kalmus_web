import importlib
import pkgutil
import os

package_dir = os.path.dirname(__file__)

for _, module_name, _ in pkgutil.iter_modules([package_dir]):
    importlib.import_module(f"{__name__}.{module_name}")
