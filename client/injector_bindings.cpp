#include <pybind11/pybind11.h>
#include "injector.h"  // Include the header file
namespace py = pybind11;

PYBIND11_MODULE(injector, m) {
    m.def("hollow_process", &HollowProcess, 
          "Hollows a target process with payload",
          py::arg("target_path"), py::arg("payload_path"));
}