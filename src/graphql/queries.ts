import { gql } from 'graphql-request';

export const GET_DRAWS = gql`
  query ($juror: String!) {
    draws(where: { juror: $juror }) { dispute { id } }
  }
`;

export const GET_DETAILS = gql`
  query ($id: ID!) {
    dispute(id: $id) {
      id
      disputeID
      court { id }
      period
      ruled
      currentRound { id nbVotes }
      templateId
    }
  }
`;

export const GET_EVIDENCE = gql`
  query ($disputeId: ID!) {
    evidences(
      where: { evidenceGroup: $disputeId }
      orderBy: timestamp
      orderDirection: asc
    ) {
      id
      evidence
      sender { id }
      timestamp
      name
      description
    }
  }
`;

export const GET_TEMPLATE = gql`
  query ($id: ID!) {
    disputeTemplate(id: $id) {
      templateData
    }
  }
`;