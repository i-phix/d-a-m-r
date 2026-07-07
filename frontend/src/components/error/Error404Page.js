import { Link } from 'react-router-dom'

function Error404Page() {
  return (
    <div className="maintenance-block">
      <div className="container">
        <div className="row">
          <div className="col-sm-12">
            <div className="card error-card">
              <div className="card-body">
                <div className="text-center">
                  <h1 className="mt-5"><b>Page Not Found</b></h1>
                  <p className="mt-2 mb-4 text-muted">
                    The page you are looking for was moved, removed,<br />
                    renamed, or might never exist!
                  </p>
                  <Link to="/" className="btn btn-primary mb-3">Go to home</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Error404Page;
