/**
 *
 * This script associates a instance with new elastic ip
 */
const AWS = require('aws-sdk');
const now =() => new Date(Date.now());

const TAGS = [{
  key: 'rotateip',
  value: 'true'
}];

const EC2_REGIONS = [
  'us-east-2'
];

// Get instance ids by region, state name, tags
async function getEc2InstanceIds(ec2Obj, stateName, tags) {
  try {
    const filters = [{
      Name: "instance-state-name",
      Values: [
        stateName
      ]
    }];
    for (const tagObj of tags) {
      filters.push({
        Name: `tag:${tagObj.key}`,
        Values: [
          tagObj.value
        ]
      });
    }
    const ec2Instances = await ec2Obj.describeInstances({
      Filters: filters
    }).promise();
    const instanceIds = [];
    for (const reservation of ec2Instances.Reservations) {
      for (const instance of reservation.Instances) {
        instanceIds.push(instance.InstanceId);
      }
    }
    return instanceIds;
  } catch (e) {
    throw e;
  }
}

function detatchEIP(ec2Obj, allocationId) {
  console.log(now(), ' info: detatchEIP for allocationId: ', allocationId);
  return ec2Obj.releaseAddress({
    AllocationId: allocationId
  }).promise();
}

// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#allocateAddress-property
function allocateEIP(ec2Obj){
  console.log(now(), ' info: allocateEIP: creating new ip');
  const params = {
    Domain: "vpc"
  };
  return ec2Obj.allocateAddress(params).promise();
}


function attachEIP(ec2Obj, instanceId, allocationId) {
  console.log(now(), ' info: attachEIP for: ', instanceId);
  return ec2Obj.associateAddress({
    InstanceId: instanceId,
    AllocationId: allocationId
  }).promise();
}

async function getAllocationId(ec2Obj, instanceId){
  console.log(now(), ' info: get allocationid for: ', instanceId);
  try {
    var allocationId ='';
    var params = {
      Filters: [
        {
          Name: "domain", 
          Values: ["vpc"]
        },
        {
          Name: "instance-id",
          Values: [instanceId]
        }
      ]
    };
    const data = await ec2Obj.describeAddresses( params ).promise();
    // TODO: improve this poorly written line
    if ( data.Addresses.length == 0 ){
      console.log('WARNING: Could not find allocation Id for the instance: ', instanceId);
    } else {
      allocationId = data.Addresses[0].AllocationId;
    }
    return allocationId;
  }catch(e){
    throw e;
  }
}

async function handleRenewEIP() {
  try {
    console.log(now(), ' info: Renewing elastic ip...');
    for (const region of EC2_REGIONS) {
      const ec2Obj = new AWS.EC2({region});

      const ec2InstanceIds = await getEc2InstanceIds(ec2Obj, 'running', TAGS); 
      console.log(now(),  ' info: ', ec2InstanceIds);
      if (!ec2InstanceIds || ec2InstanceIds.length === 0) {
        console.log('No instance for region ', region);
      }

      mainloop: for (const ec2InstanceId of ec2InstanceIds){
        const allocationId = await getAllocationId(ec2Obj, ec2InstanceId);
        
        if( allocationId != ""){
          const {data,err} = await detatchEIP(ec2Obj, allocationId);
          if (err ){
            console.log(err, err.stack);
            continue mainloop;
          }
          else console.log(now(), ' info: Released EIP for Instance: ', ec2InstanceId, ' at region: ', region);
        }
        allocateEIP(ec2Obj).then((data,err)=>{
          if (!err) {
            attachEIP(ec2Obj, ec2InstanceId, data.AllocationId )
              .then(
                (e,d) =>{
                  //TODO: nothing to do with this for now, leaving as it is for logs
                  if (err) console.log(err, err.stack); // an error occurred
                  else     console.log(now(), ' info: new data:', data);           // successful response
                });
          } else {
            console.log(err, err.stack); // an error occurred
          }

        });
      }
    }
  } catch (e) {
    throw e;
  }
}

exports.handler = async(event) => {
  try {
    console.log("Received event: ", JSON.stringify(event, null, 2));
    // console.log(event.action)
    if (event.action === 'renew') {
    await handleRenewEIP();
      // console.log(event.action)
    }
    return;
  } catch (e) {
    throw e;
  }
};
