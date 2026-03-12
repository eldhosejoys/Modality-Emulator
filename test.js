import dimse from 'dcmjs-dimse';

const { CFindRequest } = dimse.requests;

// Requesting a query by AccessionNumber only
const request = CFindRequest.createWorklistFindRequest({
    AccessionNumber: 'TEST_ACC'
});

const elements = request.getDataset().getElements();

// Current value: "0"
console.log('PatientPregnancyStatus:', elements);