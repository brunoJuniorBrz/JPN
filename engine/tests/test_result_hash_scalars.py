import json
import numpy as np
import pytest
from jpn_structural.frame3d_model import input_hash


@pytest.mark.parametrize('value',[np.float64(.125),np.float64(-0.),np.float64(1234567.89)])
def test_numpy_result_numbers_have_the_same_hash_as_their_actual_json_wire_value(value):
    result={'diagnostic':value,'active':True,'nested':[value,None,False]}
    wire=json.loads(json.dumps(result,allow_nan=False))
    assert input_hash(result)==input_hash(wire)
    assert input_hash({'value':True})!=input_hash({'value':1})
